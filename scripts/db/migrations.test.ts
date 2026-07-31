import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import { PGlite } from '@electric-sql/pglite';

const migrationsDirectory = path.resolve('supabase', 'migrations');

async function createDatabase() {
  const database = new PGlite();

  await database.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create function auth.uid()
    returns uuid
    language sql
    stable
    as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
  `);

  return database;
}

async function applyMigrations(database: PGlite) {
  const names = (await readdir(migrationsDirectory)).filter((name) => name.endsWith('.sql')).sort();

  for (const name of names) {
    const migration = await readFile(path.join(migrationsDirectory, name), 'utf8');
    await database.exec(migration);
  }
}

async function scalar<T>(database: PGlite, query: string): Promise<T> {
  const result = await database.query<{ value: T }>(query);
  assert.equal(result.rows.length, 1);
  return result.rows[0].value;
}

test('migrations apply to an empty database and enforce core invariants', async () => {
  const database = await createDatabase();

  try {
    await applyMigrations(database);

    assert.equal(
      await scalar<number>(
        database,
        `select count(*)::integer as value
         from information_schema.tables
         where table_schema = 'nagarik'`,
      ),
      33,
    );
    assert.equal(
      await scalar<number>(
        database,
        `select count(*)::integer as value
         from nagarik.capability_kill_switches`,
      ),
      7,
    );
    assert.equal(
      await scalar<number>(
        database,
        `select count(*)::integer as value
         from pg_class
         join pg_namespace on pg_namespace.oid = pg_class.relnamespace
         where pg_namespace.nspname = 'nagarik'
           and pg_class.relkind = 'r'
           and pg_class.relrowsecurity
           and pg_class.relforcerowsecurity`,
      ),
      33,
    );
    assert.equal(
      await scalar<number>(database, `select count(*)::integer as value from pg_policies`),
      28,
    );

    await database.exec(`
      insert into nagarik.organizations(id, slug, name)
      values ('10000000-0000-0000-0000-000000000001', 'test-org', 'Test organization');

      insert into nagarik.operator_profiles(auth_subject, display_name)
      values ('20000000-0000-0000-0000-000000000001', 'Test operator');

      insert into nagarik.submissions(
        id,
        tracking_id,
        organization_id,
        record_kind,
        state,
        received_at
      )
      values (
        '30000000-0000-0000-0000-000000000001',
        '30000000-0000-0000-0000-000000000002',
        '10000000-0000-0000-0000-000000000001',
        'community_report',
        'received',
        now()
      );

      insert into nagarik.submission_revisions(
        id,
        submission_id,
        revision_number,
        title,
        narrative,
        category,
        observed_on,
        lat_e3,
        lng_e3,
        ward_id,
        ward_geometry_version,
        provenance_private
      )
      values (
        '40000000-0000-0000-0000-000000000001',
        '30000000-0000-0000-0000-000000000001',
        1,
        'Unsafe drain cover',
        'A loose drain cover is visible beside the public walkway.',
        'public_safety_hazard',
        current_date,
        27717,
        85324,
        'KMC-01',
        'test-v1',
        '{}'::jsonb
      );
    `);

    await assert.rejects(
      database.exec(`
        update nagarik.submission_revisions
        set title = 'Changed title'
        where id = '40000000-0000-0000-0000-000000000001'
      `),
      /append_only_row/,
    );
  } finally {
    await database.close();
  }
});

test('legacy public tables are archived before the v2 schema is created', async () => {
  const database = await createDatabase();

  try {
    await database.exec(`
      create table public.issues (
        id bigint primary key,
        title text not null
      );
      insert into public.issues(id, title) values (1, 'Legacy issue');
    `);

    await applyMigrations(database);

    assert.equal(
      await scalar<string>(database, `select title as value from legacy_v1.issues where id = 1`),
      'Legacy issue',
    );
    assert.equal(
      await scalar<string>(database, `select to_regclass('nagarik.issues')::text as value`),
      'nagarik.issues',
    );
  } finally {
    await database.close();
  }
});

test('public projections fail closed and private tables stay inaccessible', async () => {
  const database = await createDatabase();

  try {
    await applyMigrations(database);

    await database.exec(`
      insert into public.issue_projection(
        public_id,
        workflow_version,
        publication_state,
        title,
        narrative,
        updated_at
      )
      values (
        '50000000-0000-0000-0000-000000000001',
        'v2',
        'published',
        'Public test issue',
        'Visible only while the public read switch is enabled.',
        now()
      );
    `);

    await database.exec('set role anon');
    assert.equal(
      await scalar<number>(
        database,
        'select count(*)::integer as value from public.issue_projection',
      ),
      0,
    );
    await assert.rejects(database.query('select * from nagarik.submissions'), /permission denied/);

    await database.exec('reset role');
    await database.exec(`
      update nagarik.capability_kill_switches
      set disabled = false, reason = 'migration_test'
      where capability = 'publicReadEnabled'
    `);
    await database.exec('set role anon');
    assert.equal(
      await scalar<number>(
        database,
        'select count(*)::integer as value from public.issue_projection',
      ),
      1,
    );
  } finally {
    await database.exec('reset role').catch(() => undefined);
    await database.close();
  }
});

test('idempotency and capability consumption are deterministic', async () => {
  const database = await createDatabase();

  try {
    await applyMigrations(database);
    await database.exec(`
      insert into nagarik.organizations(id, slug, name)
      values ('10000000-0000-0000-0000-000000000001', 'test-org', 'Test organization');

      insert into nagarik.capabilities(
        id,
        organization_id,
        purpose,
        subject_id,
        issuance_idempotency_id,
        key_version,
        verifier,
        expires_at
      )
      values (
        '60000000-0000-0000-0000-000000000001',
        '10000000-0000-0000-0000-000000000001',
        1,
        '60000000-0000-0000-0000-000000000002',
        '60000000-0000-0000-0000-000000000003',
        1,
        decode(repeat('11', 32), 'hex'),
        now() + interval '1 hour'
      );
    `);

    const first = await database.query<{ disposition: string }>(`
      select disposition
      from nagarik.reserve_idempotency(
        '70000000-0000-0000-0000-000000000001',
        '10000000-0000-0000-0000-000000000001',
        'v2:test',
        decode(repeat('22', 32), 'hex'),
        '70000000-0000-0000-0000-000000000002',
        decode(repeat('33', 32), 'hex'),
        now() + interval '1 hour'
      )
    `);
    assert.equal(first.rows[0].disposition, 'reserved');

    const duplicate = await database.query<{ disposition: string }>(`
      select disposition
      from nagarik.reserve_idempotency(
        '70000000-0000-0000-0000-000000000009',
        '10000000-0000-0000-0000-000000000001',
        'v2:test',
        decode(repeat('22', 32), 'hex'),
        '70000000-0000-0000-0000-000000000002',
        decode(repeat('33', 32), 'hex'),
        now() + interval '1 hour'
      )
    `);
    assert.equal(duplicate.rows[0].disposition, 'in_progress');

    const conflict = await database.query<{ disposition: string }>(`
      select disposition
      from nagarik.reserve_idempotency(
        '70000000-0000-0000-0000-000000000009',
        '10000000-0000-0000-0000-000000000001',
        'v2:test',
        decode(repeat('22', 32), 'hex'),
        '70000000-0000-0000-0000-000000000002',
        decode(repeat('44', 32), 'hex'),
        now() + interval '1 hour'
      )
    `);
    assert.equal(conflict.rows[0].disposition, 'conflict');

    await database.query(`
      select nagarik.consume_capability(
        '60000000-0000-0000-0000-000000000001',
        '10000000-0000-0000-0000-000000000001',
        1::smallint,
        decode(repeat('11', 32), 'hex')
      )
    `);
    await assert.rejects(
      database.query(`
        select nagarik.consume_capability(
          '60000000-0000-0000-0000-000000000001',
          '10000000-0000-0000-0000-000000000001',
          1::smallint,
          decode(repeat('11', 32), 'hex')
        )
      `),
      /capability_unavailable/,
    );
  } finally {
    await database.close();
  }
});

test('the last active administrator cannot be removed', async () => {
  const database = await createDatabase();

  try {
    await applyMigrations(database);
    await database.exec(`
      insert into nagarik.organizations(id, slug, name)
      values ('10000000-0000-0000-0000-000000000001', 'test-org', 'Test organization');

      insert into nagarik.operator_profiles(auth_subject, display_name)
      values
        ('20000000-0000-0000-0000-000000000001', 'First admin'),
        ('20000000-0000-0000-0000-000000000002', 'Second admin');

      insert into nagarik.role_grants(id, organization_id, auth_subject, role)
      values (
        '80000000-0000-0000-0000-000000000001',
        '10000000-0000-0000-0000-000000000001',
        '20000000-0000-0000-0000-000000000001',
        'org_admin'
      );
    `);

    await assert.rejects(
      database.exec(`
        update nagarik.role_grants
        set state = 'revoked', revoked_at = now(), version = version + 1
        where id = '80000000-0000-0000-0000-000000000001'
      `),
      /last_admin_removal_forbidden/,
    );

    await database.exec(`
      insert into nagarik.role_grants(id, organization_id, auth_subject, role)
      values (
        '80000000-0000-0000-0000-000000000002',
        '10000000-0000-0000-0000-000000000001',
        '20000000-0000-0000-0000-000000000002',
        'org_admin'
      );

      update nagarik.role_grants
      set state = 'revoked', revoked_at = now(), version = version + 1
      where id = '80000000-0000-0000-0000-000000000001';
    `);

    assert.equal(
      await scalar<string>(
        database,
        `select state as value
         from nagarik.role_grants
         where id = '80000000-0000-0000-0000-000000000001'`,
      ),
      'revoked',
    );
  } finally {
    await database.close();
  }
});

test('outbox claims preserve per-issue FIFO ordering', async () => {
  const database = await createDatabase();

  try {
    await applyMigrations(database);
    await database.exec(`
      insert into nagarik.organizations(id, slug, name)
      values ('10000000-0000-0000-0000-000000000001', 'test-org', 'Test organization');

      insert into nagarik.issues(
        id,
        public_id,
        organization_id,
        workflow_version,
        record_kind,
        publication_state,
        lifecycle
      )
      values (
        '90000000-0000-0000-0000-000000000001',
        '90000000-0000-0000-0000-000000000002',
        '10000000-0000-0000-0000-000000000001',
        'v2',
        'community_report',
        'not_published',
        'open'
      );

      insert into nagarik.outbox_jobs(
        id,
        operation_id,
        organization_id,
        issue_id,
        operation_type,
        chain_sequence,
        canonical_payload,
        payload_hash,
        state,
        created_at
      )
      values
        (
          '91000000-0000-0000-0000-000000000001',
          decode(repeat('51', 32), 'hex'),
          '10000000-0000-0000-0000-000000000001',
          '90000000-0000-0000-0000-000000000001',
          'issue_created',
          1,
          '{}'::jsonb,
          decode(repeat('61', 32), 'hex'),
          'pending',
          now() - interval '2 seconds'
        ),
        (
          '91000000-0000-0000-0000-000000000002',
          decode(repeat('52', 32), 'hex'),
          '10000000-0000-0000-0000-000000000001',
          '90000000-0000-0000-0000-000000000001',
          'status_updated',
          2,
          '{}'::jsonb,
          decode(repeat('62', 32), 'hex'),
          'pending',
          now() - interval '1 second'
        );
    `);

    const firstClaim = await database.query<{ id: string }>(
      "select id from nagarik.claim_outbox_jobs('test-worker', 25, 60)",
    );
    assert.deepEqual(
      firstClaim.rows.map((row) => row.id),
      ['91000000-0000-0000-0000-000000000001'],
    );

    await database.exec(`
      update nagarik.outbox_jobs
      set state = 'confirmed', lease_owner = null, lease_expires_at = null
      where id = '91000000-0000-0000-0000-000000000001'
    `);

    const secondClaim = await database.query<{ id: string }>(
      "select id from nagarik.claim_outbox_jobs('test-worker', 25, 60)",
    );
    assert.deepEqual(
      secondClaim.rows.map((row) => row.id),
      ['91000000-0000-0000-0000-000000000002'],
    );
  } finally {
    await database.close();
  }
});

test('operator RLS separates organizations and role capabilities', async () => {
  const database = await createDatabase();
  const orgOne = '10000000-0000-0000-0000-000000000001';
  const orgTwo = '10000000-0000-0000-0000-000000000002';
  const moderator = '20000000-0000-0000-0000-000000000001';
  const steward = '20000000-0000-0000-0000-000000000002';
  const privacyReviewer = '20000000-0000-0000-0000-000000000003';
  const auditor = '20000000-0000-0000-0000-000000000004';
  const systemAdmin = '20000000-0000-0000-0000-000000000005';

  async function countAs(subject: string, table: string): Promise<number> {
    await database.query("select set_config('request.jwt.claim.sub', $1, false)", [subject]);
    await database.exec('set role authenticated');
    try {
      return await scalar<number>(database, `select count(*)::integer as value from ${table}`);
    } finally {
      await database.exec('reset role');
    }
  }

  try {
    await applyMigrations(database);
    await database.exec(`
      insert into nagarik.organizations(id, slug, name)
      values
        ('${orgOne}', 'org-one', 'Organization one'),
        ('${orgTwo}', 'org-two', 'Organization two');

      insert into nagarik.operator_profiles(auth_subject, display_name)
      values
        ('${moderator}', 'Moderator'),
        ('${steward}', 'Steward'),
        ('${privacyReviewer}', 'Privacy reviewer'),
        ('${auditor}', 'Auditor'),
        ('${systemAdmin}', 'System administrator');

      insert into nagarik.organization_memberships(
        id, organization_id, auth_subject, state
      )
      values
        ('31000000-0000-0000-0000-000000000001', '${orgOne}', '${moderator}', 'active'),
        ('31000000-0000-0000-0000-000000000002', '${orgOne}', '${steward}', 'active'),
        ('31000000-0000-0000-0000-000000000003', '${orgOne}', '${privacyReviewer}', 'active'),
        ('31000000-0000-0000-0000-000000000004', '${orgOne}', '${auditor}', 'active');

      insert into nagarik.role_grants(
        id, organization_id, auth_subject, role
      )
      values
        ('32000000-0000-0000-0000-000000000001', '${orgOne}', '${moderator}', 'moderator'),
        ('32000000-0000-0000-0000-000000000002', '${orgOne}', '${steward}', 'steward'),
        ('32000000-0000-0000-0000-000000000003', '${orgOne}', '${privacyReviewer}', 'privacy_reviewer'),
        ('32000000-0000-0000-0000-000000000004', '${orgOne}', '${auditor}', 'auditor'),
        ('32000000-0000-0000-0000-000000000005', null, '${systemAdmin}', 'system_admin');

      insert into nagarik.submissions(
        id, tracking_id, organization_id, record_kind, state, received_at
      )
      values
        (
          '33000000-0000-0000-0000-000000000001',
          '33000000-0000-0000-0000-000000000011',
          '${orgOne}',
          'community_report',
          'received',
          now()
        ),
        (
          '33000000-0000-0000-0000-000000000002',
          '33000000-0000-0000-0000-000000000012',
          '${orgTwo}',
          'community_report',
          'received',
          now()
        );

      insert into nagarik.issues(
        id,
        public_id,
        organization_id,
        workflow_version,
        record_kind,
        publication_state,
        lifecycle
      )
      values
        (
          '34000000-0000-0000-0000-000000000001',
          '34000000-0000-0000-0000-000000000011',
          '${orgOne}',
          'v2',
          'community_report',
          'not_published',
          'open'
        ),
        (
          '34000000-0000-0000-0000-000000000002',
          '34000000-0000-0000-0000-000000000012',
          '${orgTwo}',
          'v2',
          'community_report',
          'not_published',
          'open'
        );

      insert into nagarik.privacy_requests(
        id,
        organization_id,
        target_type,
        target_id,
        request_type,
        description,
        state
      )
      values (
        '35000000-0000-0000-0000-000000000001',
        '${orgOne}',
        'submission',
        '33000000-0000-0000-0000-000000000001',
        'access',
        'Please provide the private submission information associated with this report.',
        'received'
      );

      insert into nagarik.audit_events(
        id,
        organization_id,
        actor_type,
        actor_key,
        action,
        resource_type,
        request_id
      )
      values (
        '36000000-0000-0000-0000-000000000001',
        '${orgOne}',
        'system',
        decode(repeat('71', 32), 'hex'),
        'test',
        'migration',
        '36000000-0000-0000-0000-000000000002'
      );
    `);

    assert.equal(await countAs(moderator, 'nagarik.submissions'), 1);
    assert.equal(await countAs(moderator, 'nagarik.issues'), 1);
    assert.equal(await countAs(steward, 'nagarik.submissions'), 0);
    assert.equal(await countAs(steward, 'nagarik.issues'), 1);
    assert.equal(await countAs(privacyReviewer, 'nagarik.privacy_requests'), 1);
    assert.equal(await countAs(privacyReviewer, 'nagarik.audit_events'), 0);
    assert.equal(await countAs(auditor, 'nagarik.audit_events'), 1);
    assert.equal(await countAs(systemAdmin, 'nagarik.submissions'), 2);
    assert.equal(await countAs(systemAdmin, 'nagarik.issues'), 2);
  } finally {
    await database.exec('reset role').catch(() => undefined);
    await database.close();
  }
});

test('public issue pagination has an index-backed query plan', async () => {
  const database = await createDatabase();

  try {
    await applyMigrations(database);
    await database.exec(`
      insert into public.issue_projection(
        public_id,
        workflow_version,
        publication_state,
        title,
        narrative,
        published_at,
        updated_at
      )
      select
        (
          substr(md5(sequence::text), 1, 8) || '-' ||
          substr(md5(sequence::text), 9, 4) || '-' ||
          substr(md5(sequence::text), 13, 4) || '-' ||
          substr(md5(sequence::text), 17, 4) || '-' ||
          substr(md5(sequence::text), 21, 12)
        )::uuid,
        'v2',
        'published',
        'Indexed issue ' || sequence,
        'A deterministic public projection row used only for query-plan verification.',
        now() - make_interval(secs => sequence),
        now()
      from generate_series(1, 500) sequence;

      analyze public.issue_projection;
      set enable_seqscan = off;
    `);

    const plan = await database.query<Record<string, string>>(
      `explain (costs off)
       select public_id, published_at
       from public.issue_projection
       where publication_state = 'published'
       order by published_at desc, public_id
       limit 50`,
    );
    const text = plan.rows.map((row) => Object.values(row).join(' ')).join('\n');
    assert.match(text, /issue_projection_list_idx/);
  } finally {
    await database.close();
  }
});
