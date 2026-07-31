export const operatorRoles = [
  'moderator',
  'steward',
  'privacy_reviewer',
  'auditor',
  'org_admin',
  'system_admin',
] as const;

export type OperatorRole = (typeof operatorRoles)[number];

export function hasRequiredOperatorRole(
  roles: readonly OperatorRole[],
  required: readonly OperatorRole[],
): boolean {
  return roles.includes('system_admin') || required.some((role) => roles.includes(role));
}
