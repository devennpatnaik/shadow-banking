function priorApproval(file: Record<string, unknown>): Record<string, unknown> {
  const raw = file['userApproval'];
  if (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) {
    const copy: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(raw)) copy[k] = v;
    return copy;
  }
  return {};
}

export function applyApprove(
  file: Record<string, unknown>,
  now = new Date().toISOString(),
): Record<string, unknown> {
  const status = file['status'];
  if (status === 'vetoed') {
    throw new Error('cannot approve a vetoed proposal');
  }
  if (status === 'rejected') {
    throw new Error('cannot approve a rejected proposal');
  }
  if (file['veto'] === true) {
    throw new Error('cannot approve: governor veto is latched on this file');
  }
  return {
    ...file,
    status: 'approved',
    approvedAt: now,
    rejectedAt: null,
    updatedAt: now,
    ok: true,
    userApproval: {
      ...priorApproval(file),
      required: true,
      broadcasts: false,
      markedApprovedAt: now,
      note: 'Approved on disk. Broadcasting remains forbidden in Phase 5.',
    },
  };
}

export function applyReject(
  file: Record<string, unknown>,
  now = new Date().toISOString(),
): Record<string, unknown> {
  if (file['status'] === 'approved') {
    throw new Error('cannot reject an already-approved proposal; it still cannot be broadcast');
  }
  return {
    ...file,
    status: 'rejected',
    rejectedAt: now,
    approvedAt: null,
    updatedAt: now,
    ok: false,
    userApproval: {
      ...priorApproval(file),
      required: true,
      broadcasts: false,
      markedRejectedAt: now,
      note: 'Rejected. No transaction is constructed for broadcast.',
    },
  };
}
