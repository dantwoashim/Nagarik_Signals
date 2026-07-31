begin;

create table nagarik.pilot_invitations (
  id uuid primary key,
  organization_id uuid not null references nagarik.organizations(id),
  state text not null check (state in ('active', 'consumed', 'revoked', 'expired')),
  version bigint not null default 1 check (version > 0),
  scopes text[] not null check (
    cardinality(scopes) between 1 and 2
    and scopes <@ array['intake', 'signal']::text[]
  ),
  pilot_policy_version text not null check (char_length(pilot_policy_version) between 1 and 120),
  expires_at timestamptz not null,
  created_by uuid not null references nagarik.operator_profiles(auth_subject),
  consumed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (state = 'active' and consumed_at is null and revoked_at is null)
    or (state = 'consumed' and consumed_at is not null and revoked_at is null)
    or (state = 'revoked' and consumed_at is null and revoked_at is not null)
    or (state = 'expired' and consumed_at is null)
  )
);

create index pilot_invitations_active_expiry_idx
  on nagarik.pilot_invitations(organization_id, expires_at)
  where state = 'active';

alter table nagarik.pilot_invitations enable row level security;
alter table nagarik.pilot_invitations force row level security;
revoke all on nagarik.pilot_invitations from anon, authenticated;
grant all on nagarik.pilot_invitations to service_role;
grant select on nagarik.pilot_invitations to authenticated;

create policy pilot_invitations_admin_read
on nagarik.pilot_invitations
for select
to authenticated
using (
  nagarik.has_active_role(
    organization_id,
    array['org_admin', 'system_admin']
  )
);

commit;
