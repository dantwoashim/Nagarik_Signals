type PublicMediaSource = {
  workflow_version: 'v2' | 'v1_legacy';
  media_id: string | null;
  provenance: unknown;
};

const legacyDossierPath = /^\/source-dossiers\/[a-z0-9-]+\.png$/;

export function publicMediaPath(issue: PublicMediaSource): string | null {
  if (issue.media_id) return `/api/media/med_${issue.media_id}`;
  if (issue.workflow_version !== 'v1_legacy') return null;
  if (!issue.provenance || typeof issue.provenance !== 'object' || Array.isArray(issue.provenance)) {
    return null;
  }
  const candidate = (issue.provenance as Record<string, unknown>).legacyMediaPath;
  return typeof candidate === 'string' && legacyDossierPath.test(candidate) ? candidate : null;
}
