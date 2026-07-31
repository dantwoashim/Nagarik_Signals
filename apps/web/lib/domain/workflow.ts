export const submissionStates = [
  'received',
  'under_review',
  'changes_requested',
  'revision_pending',
  'approved',
  'rejected',
  'withdrawn',
  'expired',
] as const;

export type SubmissionState = (typeof submissionStates)[number];

export const lifecycleStates = ['open', 'in_progress', 'resolved', 'closed', 'disputed'] as const;

export type LifecycleState = (typeof lifecycleStates)[number];

export const handoffStates = ['prepared', 'sent', 'acknowledged', 'closed', 'failed'] as const;

export type HandoffState = (typeof handoffStates)[number];

export class WorkflowStateError extends Error {
  constructor(
    public readonly code:
      | 'submission_transition_invalid'
      | 'submission_terminal'
      | 'lifecycle_transition_invalid'
      | 'lifecycle_terminal'
      | 'handoff_transition_invalid'
      | 'handoff_terminal',
  ) {
    super(code);
    this.name = 'WorkflowStateError';
  }
}

const submissionTransitions: Record<SubmissionState, readonly SubmissionState[]> = {
  received: ['under_review', 'withdrawn', 'expired'],
  under_review: ['changes_requested', 'approved', 'rejected', 'withdrawn'],
  changes_requested: ['revision_pending', 'under_review', 'withdrawn', 'expired'],
  revision_pending: ['under_review', 'withdrawn'],
  approved: [],
  rejected: [],
  withdrawn: [],
  expired: [],
};

const lifecycleTransitions: Record<LifecycleState, readonly LifecycleState[]> = {
  open: ['in_progress', 'disputed', 'closed'],
  in_progress: ['resolved', 'disputed', 'closed'],
  resolved: ['disputed', 'closed'],
  disputed: ['open', 'in_progress', 'resolved', 'closed'],
  closed: [],
};

const handoffTransitions: Record<HandoffState | 'none', readonly HandoffState[]> = {
  none: ['prepared'],
  prepared: ['sent', 'failed'],
  sent: ['acknowledged', 'failed'],
  acknowledged: ['closed'],
  failed: [],
  closed: [],
};

export function assertSubmissionTransition(current: SubmissionState, next: SubmissionState): void {
  if (submissionTransitions[current].includes(next)) return;
  if (submissionTransitions[current].length === 0) {
    throw new WorkflowStateError('submission_terminal');
  }
  throw new WorkflowStateError('submission_transition_invalid');
}

export function assertLifecycleTransition(current: LifecycleState, next: LifecycleState): void {
  if (lifecycleTransitions[current].includes(next)) return;
  if (current === 'closed') throw new WorkflowStateError('lifecycle_terminal');
  throw new WorkflowStateError('lifecycle_transition_invalid');
}

export function assertHandoffTransition(current: HandoffState | null, next: HandoffState): void {
  const transitions = handoffTransitions[current ?? 'none'];
  if (transitions.includes(next)) return;
  if (current === 'closed' || current === 'failed') {
    throw new WorkflowStateError('handoff_terminal');
  }
  throw new WorkflowStateError('handoff_transition_invalid');
}
