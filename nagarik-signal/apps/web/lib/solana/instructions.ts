import type { IssueCategory, IssueStatus } from '../types';

export type CreateIssueInstructionInput = {
  issueId: string;
  category: IssueCategory;
  firstObservedAt: string;
  metadataHash: string;
  evidenceHash: string;
  locationHash: string;
};

export type UpdateStatusInstructionInput = {
  issueId: string;
  seq: number;
  newStatus: IssueStatus;
  proofHash: string;
};

export function describeCreateIssue(input: CreateIssueInstructionInput) {
  return {
    instruction: 'create_issue',
    seed: ['issue', input.issueId],
    hashes: {
      metadataHash: input.metadataHash,
      evidenceHash: input.evidenceHash,
      locationHash: input.locationHash,
    },
  };
}

export function describeUpdateStatus(input: UpdateStatusInstructionInput) {
  return {
    instruction: 'update_status',
    seed: ['status_update', input.issueId, String(input.seq)],
    newStatus: input.newStatus,
    proofHash: input.proofHash,
  };
}
