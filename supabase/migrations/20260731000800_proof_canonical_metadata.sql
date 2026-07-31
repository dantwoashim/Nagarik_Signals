begin;

alter table public.proof_projection
  add column canonical_metadata jsonb not null default '{}'::jsonb;

alter table public.proof_projection
  alter column canonical_metadata drop default;

alter table public.proof_projection
  add constraint proof_projection_canonical_metadata_object
  check (jsonb_typeof(canonical_metadata) = 'object');

commit;
