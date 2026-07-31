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
  options: { allowSystemAdminOverride?: boolean } = {},
): boolean {
  return (
    (options.allowSystemAdminOverride !== false && roles.includes('system_admin')) ||
    required.some((role) => roles.includes(role))
  );
}
