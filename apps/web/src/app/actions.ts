'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  createViewerProposal,
  decideProposal,
  runViewerPaper,
  updateViewerSettings,
} from '@/lib/engine';
import { requireViewer } from '@/lib/identity';

export async function saveSettingsAction(formData: FormData) {
  const identity = await requireViewer();
  await updateViewerSettings(identity.sub, {
    seedUsd: String(formData.get('seedUsd') ?? ''),
    hurdlePct: String(formData.get('hurdlePct') ?? ''),
    reservePct: String(formData.get('reservePct') ?? ''),
  });
  revalidatePath('/');
  revalidatePath('/stack');
  revalidatePath('/settings');
  redirect('/settings');
}

export async function runPaperAction(formData: FormData) {
  const identity = await requireViewer();
  const steps = Number(formData.get('steps') ?? '7');
  if (!Number.isFinite(steps) || steps < 1 || steps > 31) {
    throw new Error('steps must be 1–31');
  }
  await runViewerPaper(identity.sub, Math.floor(steps));
  revalidatePath('/paper');
  revalidatePath('/');
  redirect('/paper');
}

export async function proposeAction(formData: FormData) {
  const identity = await requireViewer();
  const preset = String(formData.get('preset') ?? 'hold-liquid');
  await createViewerProposal(identity.sub, preset);
  revalidatePath('/proposals');
  redirect('/proposals');
}

export async function decideAction(formData: FormData) {
  const identity = await requireViewer();
  const id = String(formData.get('id') ?? '');
  const decision = String(formData.get('decision') ?? '');
  if (decision !== 'approve' && decision !== 'reject') {
    throw new Error('decision must be approve or reject');
  }
  await decideProposal(identity.sub, id, decision);
  revalidatePath('/proposals');
  redirect('/proposals');
}
