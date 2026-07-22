import type { IssueCategory, IssueStatus } from '../types';

export const categoryIds: IssueCategory[] = [
  'road',
  'waste',
  'water',
  'electricity_lighting',
  'public_facility',
  'public_safety_hazard',
  'other_public_infrastructure',
];

export const statusIds: IssueStatus[] = [
  'submitted',
  'verified',
  'in_progress',
  'resolved',
  'disputed',
  'rejected',
];

export function categoryToProgramValue(category: IssueCategory) {
  const index = categoryIds.indexOf(category);
  if (index === -1) throw new Error(`Unsupported category: ${category}`);
  return index;
}

export function statusToProgramValue(status: IssueStatus) {
  const index = statusIds.indexOf(status);
  if (index === -1) throw new Error(`Unsupported status: ${status}`);
  return index;
}

export function statusFromProgramValue(status: number): IssueStatus {
  return statusIds[status] ?? 'submitted';
}

export function categoryFromProgramValue(category: number): IssueCategory {
  return categoryIds[category] ?? 'other_public_infrastructure';
}
