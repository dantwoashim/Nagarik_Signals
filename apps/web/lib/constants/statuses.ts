import type { IssueStatus } from '../types';

export const statuses: Array<{ id: IssueStatus; label: string; closed: boolean }> = [
  { id: 'submitted', label: 'Submitted', closed: false },
  { id: 'verified', label: 'Verified', closed: false },
  { id: 'in_progress', label: 'In progress', closed: false },
  { id: 'resolved', label: 'Resolved', closed: true },
  { id: 'disputed', label: 'Disputed', closed: false },
  { id: 'rejected', label: 'Rejected', closed: true },
];

export function statusLabel(status: IssueStatus) {
  return statuses.find((item) => item.id === status)?.label ?? status;
}

export function publicStatusLabel(status: IssueStatus) {
  const labels: Record<IssueStatus, string> = {
    submitted: 'Open',
    verified: 'Publicly signalled',
    in_progress: 'Follow-up in progress',
    resolved: 'Marked resolved',
    disputed: 'Under dispute',
    rejected: 'Closed',
  };
  return labels[status];
}

const allowedTransitions: Record<IssueStatus, IssueStatus[]> = {
  submitted: ['verified', 'in_progress', 'resolved', 'disputed', 'rejected'],
  verified: ['in_progress', 'resolved', 'disputed', 'rejected'],
  in_progress: ['resolved', 'disputed', 'rejected'],
  disputed: ['submitted', 'verified', 'in_progress', 'resolved', 'rejected'],
  resolved: [],
  rejected: [],
};

export function validStatusTransitions(status: IssueStatus) {
  return allowedTransitions[status];
}

export function isValidStatusTransition(oldStatus: IssueStatus, newStatus: IssueStatus) {
  return allowedTransitions[oldStatus].includes(newStatus);
}

export function isClosedStatus(status: IssueStatus) {
  return statuses.find((item) => item.id === status)?.closed ?? false;
}
