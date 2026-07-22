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

export function isClosedStatus(status: IssueStatus) {
  return statuses.find((item) => item.id === status)?.closed ?? false;
}
