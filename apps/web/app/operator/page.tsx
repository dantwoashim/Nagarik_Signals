import type { Metadata } from 'next';

import { OperatorAuthPanel } from '@/components/operator/OperatorAuthPanel';
import {
  OperatorWorkspace,
  type OperatorOrganization,
} from '@/components/operator/OperatorWorkspace';
import { type OperatorRole } from '@/lib/auth/policy';
import { createServerSupabaseClient, getSupabaseConfig } from '@/lib/db/supabase';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Operator workspace',
  robots: { index: false, follow: false },
};

type GrantRow = {
  organization_id: string | null;
  role: OperatorRole;
};

type OrganizationRow = {
  id: string;
  name: string;
};

type PolicyRow = {
  organization_id: string;
  boundary_version: string;
  invitation_scope: string[];
};

export default async function OperatorPage({
  searchParams,
}: {
  searchParams: Promise<{ organization?: string }>;
}) {
  if (!getSupabaseConfig().configured) {
    return (
      <section className="container page-section operator-page">
        <OperatorAuthPanel mode="unavailable" />
      </section>
    );
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return (
      <section className="container page-section operator-page">
        <header className="operator-entry-heading">
          <span className="eyebrow">Private operations</span>
          <h1>Operator workspace</h1>
        </header>
        <OperatorAuthPanel mode="sign_in" />
      </section>
    );
  }

  const [{ data: assurance }, { data: factorData }] = await Promise.all([
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    supabase.auth.mfa.listFactors(),
  ]);
  if (assurance?.currentLevel !== 'aal2') {
    const factors = (factorData?.totp ?? [])
      .filter((factor) => factor.status === 'verified')
      .map((factor) => ({
        id: factor.id,
        friendlyName: factor.friendly_name ?? 'Authenticator',
      }));
    return (
      <section className="container page-section operator-page">
        <header className="operator-entry-heading">
          <span className="eyebrow">Private operations</span>
          <h1>Operator workspace</h1>
        </header>
        <OperatorAuthPanel mode="mfa" email={user.email ?? 'this account'} factors={factors} />
      </section>
    );
  }

  const { data: grantData, error: grantError } = await supabase
    .schema('nagarik')
    .from('role_grants')
    .select('organization_id,role')
    .eq('auth_subject', user.id)
    .eq('state', 'active');
  const grants = (grantData ?? []) as GrantRow[];
  if (grantError || !grants.length) {
    return (
      <section className="container page-section operator-page">
        <OperatorAuthPanel mode="denied" email={user.email ?? user.id} />
      </section>
    );
  }

  const globalRoles = grants
    .filter((grant) => grant.organization_id === null)
    .map((grant) => grant.role);
  const isSystemAdmin = globalRoles.includes('system_admin');
  const grantedOrganizationIds = [
    ...new Set(grants.flatMap((grant) => (grant.organization_id ? [grant.organization_id] : []))),
  ];

  let organizationQuery = supabase
    .schema('nagarik')
    .from('organizations')
    .select('id,name')
    .eq('status', 'active')
    .order('name');
  if (!isSystemAdmin) {
    organizationQuery = organizationQuery.in('id', grantedOrganizationIds);
  }
  const { data: organizationData, error: organizationError } = await organizationQuery;
  const organizationRows = (organizationData ?? []) as OrganizationRow[];
  if (organizationError || !organizationRows.length) {
    return (
      <section className="container page-section operator-page">
        <OperatorAuthPanel mode="denied" email={user.email ?? user.id} />
      </section>
    );
  }

  const { data: policyData } = await supabase
    .schema('nagarik')
    .from('pilot_policies')
    .select('organization_id,boundary_version,invitation_scope')
    .eq('state', 'active')
    .in(
      'organization_id',
      organizationRows.map((organization) => organization.id),
    );
  const policies = (policyData ?? []) as PolicyRow[];
  const organizations: OperatorOrganization[] = organizationRows.map((organization) => {
    const policy = policies.find((candidate) => candidate.organization_id === organization.id);
    const roles = [
      ...new Set([
        ...globalRoles,
        ...grants
          .filter((grant) => grant.organization_id === organization.id)
          .map((grant) => grant.role),
      ]),
    ];
    return {
      id: organization.id,
      name: organization.name,
      roles,
      pilotPolicyVersion: policy?.boundary_version ?? null,
      invitationScopes: policy?.invitation_scope ?? [],
    };
  });

  const requested = (await searchParams).organization;
  const selectedOrganizationId = organizations.some((organization) => organization.id === requested)
    ? requested!
    : organizations[0].id;

  return (
    <section className="container page-section operator-page">
      <OperatorWorkspace
        email={user.email ?? user.id}
        organizations={organizations}
        selectedOrganizationId={selectedOrganizationId}
      />
    </section>
  );
}
