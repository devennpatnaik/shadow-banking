export const PAPER_ENVELOPE = {
  paper: true as const,
  execution: 'forbidden' as const,
  phase: '1-4' as const,
  signingKeys: false as const,
  liveTransactions: false as const,
};

export const EXIT_OK = 0;
export const EXIT_ERROR = 1;
export const EXIT_VETO = 2;
