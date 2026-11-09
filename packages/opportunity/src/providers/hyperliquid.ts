import { hourlyFundingToApr, parseFinite, requireFinite, roundNumber } from '../numbers.js';
import { DEFAULT_HYPERLIQUID_INFO, type HttpClient, type ProviderPatch } from '../types.js';

interface AssetMeta {
  name: string;
  maxLeverage?: number;
}

interface AssetCtx {
  funding: string;
  markPx?: string;
  oraclePx?: string;
}

interface FundingPoint {
  coin: string;
  fundingRate: string;
  time: number;
}

function mean(xs: number[]): number | undefined {
  if (xs.length === 0) return undefined;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function dayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export async function fetchHyperliquidPatch(
  http: HttpClient,
  infoUrl = DEFAULT_HYPERLIQUID_INFO,
): Promise<ProviderPatch> {
  try {
    const metaRes = await http.postJson<[{ universe: AssetMeta[] }, AssetCtx[]]>(
      infoUrl,
      { type: 'metaAndAssetCtxs' },
      'hl:metaAndAssetCtxs',
    );
    const meta = metaRes.data[0];
    const ctxs = metaRes.data[1];
    if (!meta?.universe || !ctxs) {
      throw new Error('metaAndAssetCtxs missing universe or ctxs');
    }
    const idx = meta.universe.findIndex((u) => u.name === 'ETH');
    const ethMeta = idx >= 0 ? meta.universe[idx] : undefined;
    const ethCtx = idx >= 0 ? ctxs[idx] : undefined;
    if (!ethMeta || !ethCtx) throw new Error('ETH not in Hyperliquid universe');

    const hourly = requireFinite(ethCtx.funding, 'ETH funding');
    const currentApr = hourlyFundingToApr(hourly);
    const maxLev = ethMeta.maxLeverage !== undefined ? ethMeta.maxLeverage : undefined;

    const now = Date.now();
    const start30 = now - 30 * 24 * 3600 * 1000;
    const hist1 = await http.postJson<FundingPoint[]>(
      infoUrl,
      { type: 'fundingHistory', coin: 'ETH', startTime: start30 },
      `hl:fundingHistory:ETH:${start30}`,
    );
    let history = hist1.data;
    if (history.length >= 500) {
      const last = history[history.length - 1];
      if (last) {
        const hist2 = await http.postJson<FundingPoint[]>(
          infoUrl,
          { type: 'fundingHistory', coin: 'ETH', startTime: last.time + 1 },
          `hl:fundingHistory:ETH:${last.time + 1}`,
        );
        history = history.concat(hist2.data);
      }
    }

    const hourlies = history
      .map((p) => parseFinite(p.fundingRate))
      .filter((n): n is number => n !== undefined);
    const last7 = history.filter((p) => p.time >= now - 7 * 24 * 3600 * 1000);
    const h7 = last7
      .map((p) => parseFinite(p.fundingRate))
      .filter((n): n is number => n !== undefined);
    const avg7 = mean(h7);
    const avg30 = mean(hourlies);

    const byDay = new Map<string, number[]>();
    for (const p of history) {
      const rate = parseFinite(p.fundingRate);
      if (rate === undefined) continue;
      const k = dayKey(p.time);
      const arr = byDay.get(k) ?? [];
      arr.push(rate);
      byDay.set(k, arr);
    }
    const dailyAprs: number[] = [];
    let negativeDays = 0;
    for (const rates of byDay.values()) {
      const daily = rates.reduce((a, b) => a + b, 0);
      dailyAprs.push(roundNumber(daily * 365, 8));
      if (daily < 0) negativeDays += 1;
    }
    const highest = dailyAprs.length ? Math.max(...dailyAprs) : undefined;
    const lowest = dailyAprs.length ? Math.min(...dailyAprs) : undefined;

    const funding: Record<string, unknown> = {
      currentHourlyRate: roundNumber(hourly, 12),
      currentApr,
      source: `${infoUrl} POST type=metaAndAssetCtxs + fundingHistory coin=ETH`,
      asOf: metaRes.asOf,
      notes:
        'Positive hourly funding means longs pay shorts. APR = hourly × 24 × 365 from the venue rate; averages are the mean of returned hourly samples, not invented. planningApr/stressApr and CEX history stay on the fixture overlay when present.',
    };
    if (avg7 !== undefined) funding['avg7dApr'] = hourlyFundingToApr(avg7);
    if (avg30 !== undefined) funding['avg30dApr'] = hourlyFundingToApr(avg30);
    if (highest !== undefined) funding['highestDayLast30dApr'] = highest;
    if (lowest !== undefined) funding['lowestDayLast30dApr'] = lowest;
    if (byDay.size > 0) funding['negativeDaysLast30'] = negativeDays;

    const hyperliquid: Record<string, unknown> = {
      ...(maxLev !== undefined ? { ethMaxLeverage: maxLev } : {}),
      fundingIntervalHours: 1,
      funding: { ETH: funding },
      source: infoUrl,
      asOf: metaRes.asOf,
    };

    return {
      provider: 'hyperliquid',
      asOf: metaRes.asOf,
      source: infoUrl,
      hyperliquid,
      quality: hourlies.length === 0 ? 'degraded' : 'ok',
      degradations:
        hourlies.length === 0
          ? [{ provider: 'hyperliquid', reason: 'fundingHistory empty; current rate only' }]
          : [],
    };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return {
      provider: 'hyperliquid',
      asOf: new Date().toISOString(),
      source: infoUrl,
      quality: 'unavailable',
      degradations: [
        {
          provider: 'hyperliquid',
          reason: `${reason} — retained fixture Hyperliquid fees/funding; did not invent replacements`,
        },
      ],
    };
  }
}
