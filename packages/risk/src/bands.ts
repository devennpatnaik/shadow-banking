import { d, type Decimal } from '@shadow-banking/core';
import {
  HF_CORRELATED,
  HF_UNCORRELATED,
  LD_UNCORRELATED,
  SMALL_POSITION_HF_BUFFER,
} from './config.js';
import type { HfBands } from './types.js';

export function hfBands(correlated: boolean, smallPosition: boolean): HfBands {
  const extra = smallPosition ? SMALL_POSITION_HF_BUFFER : d(0);
  const src = correlated ? HF_CORRELATED : HF_UNCORRELATED;
  const caution = src.caution.plus(extra);
  const delev = src.delev.plus(extra);
  const emerg = src.emerg.plus(extra);
  return {
    caution,
    delev,
    emerg,
    hysteresis: src.hysteresis,
    postActionMin: caution.plus(src.postActionBuffer),
  };
}

export function ldBands(smallPosition: boolean): {
  caution: Decimal;
  delev: Decimal;
  emerg: Decimal;
  hysteresis: Decimal;
} {
  // Small-position close-factor does not change LD formulas; HF buffer is the control.
  void smallPosition;
  return LD_UNCORRELATED;
}

export function maxLeverage(correlated: boolean): Decimal {
  return correlated ? d('3.0') : d('2.0');
}
