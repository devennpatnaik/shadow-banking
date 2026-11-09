import { z } from 'zod';
import { Decimal } from './money.js';

/**
 * Disclosure schema (spec §2B). This is what the user tells us; it is the only input that
 * turns a bank balance into "deployable capital". See liquidity.ts for the derivation.
 */

const numericString = /^-?\d+(\.\d+)?$/;

/** Accepts numbers, numeric strings, or Decimal instances; always yields a Decimal. */
export const decimalSchema = z
  .union([
    z.number().finite(),
    z.string().regex(numericString, 'numeric string'),
    z.instanceof(Decimal),
  ])
  .transform((v) => new Decimal(v));

export const nonNegativeDecimal = decimalSchema.refine((v) => v.gte(0), {
  message: 'must be >= 0',
});

/** Rates are decimal fractions per year: 0.05 = 5%. */
export const rateSchema = decimalSchema.refine((v) => v.gte(0) && v.lte(5), {
  message: 'rate must be a decimal fraction per year between 0 and 5 (0.05 = 5%)',
});

export const IncomeStabilitySchema = z.enum(['stable', 'variable', 'irregular', 'none']);
export type IncomeStability = z.infer<typeof IncomeStabilitySchema>;

export const RiskToleranceSchema = z.enum(['conservative', 'moderate', 'aggressive']);
export type RiskTolerance = z.infer<typeof RiskToleranceSchema>;

export const AssetClassSchema = z.enum([
  'cash',
  'stablecoin',
  'native_crypto',
  'liquid_staking_token',
  'lp_position',
  'derivative',
  'equity',
  'bond',
  'other',
]);
export type AssetClass = z.infer<typeof AssetClassSchema>;

export const RestrictionsSchema = z.object({
  /** Whether the platform may borrow against the user's assets at all. */
  allowLeverage: z.boolean().default(true),
  /** Hard cap on gross assets / equity for managed positions. */
  maxLeverage: z.number().positive().optional(),
  allowDerivatives: z.boolean().default(false),
  excludedAssetClasses: z.array(AssetClassSchema).default([]),
  excludedNetworks: z.array(z.string()).default([]),
  excludedProtocols: z.array(z.string()).default([]),
});

export const DisclosureProfileSchema = z.object({
  currency: z.string().default('USD'),
  asOf: z.string().optional(),
  income: z.object({
    /** Net (after-tax) monthly income. */
    monthlyNet: nonNegativeDecimal,
    stability: IncomeStabilitySchema,
    notes: z.string().optional(),
  }),
  recurringExpenses: z.array(
    z.object({
      label: z.string(),
      monthlyAmount: nonNegativeDecimal,
      essential: z.boolean().default(true),
    }),
  ),
  existingDebts: z.array(
    z.object({
      label: z.string(),
      balance: nonNegativeDecimal,
      annualRate: rateSchema,
      minimumMonthlyPayment: nonNegativeDecimal.default(0),
      secured: z.boolean().default(false),
    }),
  ),
  /** Cash the user already holds aside for emergencies (counts toward the household reserve). */
  emergencySavings: nonNegativeDecimal,
  nearTermCashNeeds: z.array(
    z.object({
      label: z.string(),
      amount: nonNegativeDecimal,
      dueInMonths: z.number().int().nonnegative(),
    }),
  ),
  horizonMonths: z.number().int().positive(),
  riskTolerance: RiskToleranceSchema,
  tax: z.object({
    residencyCountry: z.string().min(2),
    stateOrRegion: z.string().optional(),
    /** Free text: e.g. "staking rewards taxed as income on receipt". */
    notes: z.string().optional(),
  }),
  restrictions: RestrictionsSchema.default({
    allowLeverage: true,
    allowDerivatives: false,
    excludedAssetClasses: [],
    excludedNetworks: [],
    excludedProtocols: [],
  }),
});

export type DisclosureProfileInput = z.input<typeof DisclosureProfileSchema>;
export type DisclosureProfile = z.output<typeof DisclosureProfileSchema>;

export function parseDisclosureProfile(input: unknown): DisclosureProfile {
  return DisclosureProfileSchema.parse(input);
}
