import 'server-only';

import type { User } from '@supabase/supabase-js';

import { createServerSupabaseClient } from '@/lib/db/supabase';
import { hasRequiredOperatorRole, type OperatorRole } from '@/lib/auth/policy';

type OperatorGrant = {
  organization_id: string | null;
  role: OperatorRole;
};

export type OperatorContext = {
  user: User;
  aal: 'aal2';
  organizationId: string | null;
  roles: readonly OperatorRole[];
};

export class OperatorAuthorizationError extends Error {
  constructor(
    public readonly code:
      'operator_authentication_required' | 'operator_aal2_required' | 'operator_role_required',
  ) {
    super(code);
    this.name = 'OperatorAuthorizationError';
  }
}

function matchingRoles(
  grants: readonly OperatorGrant[],
  organizationId: string | null,
): OperatorRole[] {
  const roles = grants
    .filter(
      (grant) =>
        grant.organization_id === organizationId ||
        (grant.organization_id === null && grant.role === 'system_admin'),
    )
    .map((grant) => grant.role);
  return [...new Set(roles)];
}

export async function requireOperator(input: {
  organizationId: string | null;
  roles: readonly OperatorRole[];
}): Promise<OperatorContext> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new OperatorAuthorizationError('operator_authentication_required');
  }

  const { data: assurance, error: assuranceError } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (assuranceError || assurance.currentLevel !== 'aal2') {
    throw new OperatorAuthorizationError('operator_aal2_required');
  }

  const { data, error } = await supabase
    .schema('nagarik')
    .from('role_grants')
    .select('organization_id,role')
    .eq('auth_subject', user.id)
    .eq('state', 'active');

  if (error) {
    throw new OperatorAuthorizationError('operator_role_required');
  }

  const roles = matchingRoles((data ?? []) as OperatorGrant[], input.organizationId);
  if (!hasRequiredOperatorRole(roles, input.roles)) {
    throw new OperatorAuthorizationError('operator_role_required');
  }

  return {
    user,
    aal: 'aal2',
    organizationId: input.organizationId,
    roles,
  };
}
