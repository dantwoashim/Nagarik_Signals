use anchor_lang::prelude::*;
use anchor_lang::solana_program::hash::hashv;

use crate::errors::NagarikSignalV2Error;
use crate::state::{
    nonzero_hash, valid_category, valid_lifecycle, valid_lifecycle_transition, CommitmentEvent,
    IssueCommitment, ProtocolConfig, RoleGrant, EVENT_HANDOFF_CHECKPOINTED, EVENT_ISSUE_CREATED,
    EVENT_LIFECYCLE_CHANGED, EVENT_METADATA_VERSION_COMMITTED, EVENT_PUBLICATION_REMOVED,
    LIFECYCLE_OPEN, MAX_SEQUENCE, PROTOCOL_VERSION, ROLE_HANDOFF_WRITER, ROLE_ISSUE_ISSUER,
    ROLE_LIFECYCLE_WRITER, ROLE_REMOVAL_WRITER,
};

const EVENT_RECORD_DOMAIN: &[u8] = b"nagarik:v2:event-record\0";
const TIMELINE_DOMAIN: &[u8] = b"nagarik:v2:timeline\0";
const HANDOFF_DOMAIN: &[u8] = b"nagarik:v2:handoff\0";

#[derive(Accounts)]
#[instruction(issue_key: [u8; 32], event_id: [u8; 32])]
pub struct CreateIssue<'info> {
    #[account(mut)]
    pub actor: Signer<'info>,
    #[account(
        seeds = [ProtocolConfig::SEED_PREFIX, ProtocolConfig::SEED_VERSION],
        bump = protocol_config.bump
    )]
    pub protocol_config: Account<'info, ProtocolConfig>,
    #[account(
        seeds = [
            RoleGrant::SEED_PREFIX,
            protocol_config.key().as_ref(),
            actor.key().as_ref()
        ],
        bump = role_grant.bump
    )]
    pub role_grant: Account<'info, RoleGrant>,
    #[account(
        init,
        payer = actor,
        space = IssueCommitment::LEN,
        seeds = [
            IssueCommitment::SEED_PREFIX,
            protocol_config.key().as_ref(),
            issue_key.as_ref()
        ],
        bump
    )]
    pub issue_commitment: Account<'info, IssueCommitment>,
    #[account(
        init,
        payer = actor,
        space = CommitmentEvent::LEN,
        seeds = [
            CommitmentEvent::SEED_PREFIX,
            issue_commitment.key().as_ref(),
            event_id.as_ref()
        ],
        bump
    )]
    pub commitment_event: Account<'info, CommitmentEvent>,
    pub system_program: Program<'info, System>,
}

#[allow(clippy::too_many_arguments)]
pub fn create_issue(
    ctx: Context<CreateIssue>,
    issue_key: [u8; 32],
    event_id: [u8; 32],
    category: u8,
    payload_hash: [u8; 32],
    metadata_hash: [u8; 32],
    evidence_hash: [u8; 32],
    location_hash: [u8; 32],
) -> Result<()> {
    validate_protocol_and_role(
        &ctx.accounts.protocol_config,
        ctx.accounts.protocol_config.key(),
        &ctx.accounts.role_grant,
        ctx.accounts.actor.key(),
        ROLE_ISSUE_ISSUER,
    )?;
    require!(
        nonzero_hash(&issue_key)
            && nonzero_hash(&event_id)
            && nonzero_hash(&payload_hash)
            && nonzero_hash(&metadata_hash)
            && nonzero_hash(&evidence_hash)
            && nonzero_hash(&location_hash),
        NagarikSignalV2Error::ZeroCommitment
    );
    require!(
        valid_category(category),
        NagarikSignalV2Error::InvalidCategory
    );

    let now = Clock::get()?.unix_timestamp;
    let issue_pubkey = ctx.accounts.issue_commitment.key();
    let actor = ctx.accounts.actor.key();
    let (event, timeline_head) = build_event(EventInput {
        issue: issue_pubkey,
        issue_key,
        event_id,
        event_type: EVENT_ISSUE_CREATED,
        category,
        sequence: 1,
        previous_head: [0; 32],
        payload_hash,
        metadata_hash,
        evidence_hash,
        location_hash,
        lifecycle: LIFECYCLE_OPEN,
        publication_removed: false,
        occurred_at: now,
        actor,
        bump: ctx.bumps.commitment_event,
    });
    ctx.accounts.commitment_event.set_inner(event);
    ctx.accounts.issue_commitment.set_inner(IssueCommitment {
        protocol: ctx.accounts.protocol_config.key(),
        issue_key,
        issuer: actor,
        category,
        lifecycle: LIFECYCLE_OPEN,
        publication_removed: false,
        metadata_hash,
        evidence_hash,
        location_hash,
        timeline_head,
        handoff_head: [0; 32],
        update_count: 1,
        created_at: now,
        updated_at: now,
        bump: ctx.bumps.issue_commitment,
        reserved: [0; 32],
    });
    Ok(())
}

#[derive(Accounts)]
#[instruction(event_id: [u8; 32])]
pub struct AppendIssueEvent<'info> {
    #[account(mut)]
    pub actor: Signer<'info>,
    #[account(
        seeds = [ProtocolConfig::SEED_PREFIX, ProtocolConfig::SEED_VERSION],
        bump = protocol_config.bump
    )]
    pub protocol_config: Account<'info, ProtocolConfig>,
    #[account(
        seeds = [
            RoleGrant::SEED_PREFIX,
            protocol_config.key().as_ref(),
            actor.key().as_ref()
        ],
        bump = role_grant.bump
    )]
    pub role_grant: Account<'info, RoleGrant>,
    #[account(
        mut,
        seeds = [
            IssueCommitment::SEED_PREFIX,
            protocol_config.key().as_ref(),
            issue_commitment.issue_key.as_ref()
        ],
        bump = issue_commitment.bump,
        constraint = issue_commitment.protocol == protocol_config.key()
            @ NagarikSignalV2Error::InvalidIssue
    )]
    pub issue_commitment: Account<'info, IssueCommitment>,
    #[account(
        init,
        payer = actor,
        space = CommitmentEvent::LEN,
        seeds = [
            CommitmentEvent::SEED_PREFIX,
            issue_commitment.key().as_ref(),
            event_id.as_ref()
        ],
        bump
    )]
    pub commitment_event: Account<'info, CommitmentEvent>,
    pub system_program: Program<'info, System>,
}

#[allow(clippy::too_many_arguments)]
pub fn commit_metadata_version(
    ctx: Context<AppendIssueEvent>,
    event_id: [u8; 32],
    expected_update_count: u64,
    expected_timeline_head: [u8; 32],
    expected_handoff_head: [u8; 32],
    expected_category: u8,
    new_category: u8,
    payload_hash: [u8; 32],
    new_metadata_hash: [u8; 32],
    new_evidence_hash: [u8; 32],
    new_location_hash: [u8; 32],
) -> Result<()> {
    validate_protocol_and_role(
        &ctx.accounts.protocol_config,
        ctx.accounts.protocol_config.key(),
        &ctx.accounts.role_grant,
        ctx.accounts.actor.key(),
        ROLE_ISSUE_ISSUER,
    )?;
    validate_append(
        &ctx.accounts.issue_commitment,
        expected_update_count,
        &expected_timeline_head,
        &expected_handoff_head,
    )?;
    require!(
        !ctx.accounts.issue_commitment.publication_removed,
        NagarikSignalV2Error::IssueRemoved
    );
    require!(
        ctx.accounts.issue_commitment.category == expected_category,
        NagarikSignalV2Error::StaleCategory
    );
    require!(
        valid_category(new_category),
        NagarikSignalV2Error::InvalidCategory
    );
    require!(
        nonzero_hash(&event_id)
            && nonzero_hash(&payload_hash)
            && nonzero_hash(&new_metadata_hash)
            && nonzero_hash(&new_evidence_hash)
            && nonzero_hash(&new_location_hash),
        NagarikSignalV2Error::ZeroCommitment
    );

    let now = Clock::get()?.unix_timestamp;
    let sequence = next_sequence(expected_update_count)?;
    let issue_key = ctx.accounts.issue_commitment.issue_key;
    let issue_pubkey = ctx.accounts.issue_commitment.key();
    let lifecycle = ctx.accounts.issue_commitment.lifecycle;
    let actor = ctx.accounts.actor.key();
    let (event, new_head) = build_event(EventInput {
        issue: issue_pubkey,
        issue_key,
        event_id,
        event_type: EVENT_METADATA_VERSION_COMMITTED,
        category: new_category,
        sequence,
        previous_head: expected_timeline_head,
        payload_hash,
        metadata_hash: new_metadata_hash,
        evidence_hash: new_evidence_hash,
        location_hash: new_location_hash,
        lifecycle,
        publication_removed: false,
        occurred_at: now,
        actor,
        bump: ctx.bumps.commitment_event,
    });
    ctx.accounts.commitment_event.set_inner(event);
    let issue = &mut ctx.accounts.issue_commitment;
    issue.category = new_category;
    issue.metadata_hash = new_metadata_hash;
    issue.evidence_hash = new_evidence_hash;
    issue.location_hash = new_location_hash;
    issue.timeline_head = new_head;
    issue.update_count = sequence;
    issue.updated_at = now;
    Ok(())
}

#[allow(clippy::too_many_arguments)]
pub fn append_lifecycle(
    ctx: Context<AppendIssueEvent>,
    event_id: [u8; 32],
    expected_update_count: u64,
    expected_timeline_head: [u8; 32],
    expected_handoff_head: [u8; 32],
    expected_lifecycle: u8,
    new_lifecycle: u8,
    payload_hash: [u8; 32],
) -> Result<()> {
    validate_protocol_and_role(
        &ctx.accounts.protocol_config,
        ctx.accounts.protocol_config.key(),
        &ctx.accounts.role_grant,
        ctx.accounts.actor.key(),
        ROLE_LIFECYCLE_WRITER,
    )?;
    validate_append(
        &ctx.accounts.issue_commitment,
        expected_update_count,
        &expected_timeline_head,
        &expected_handoff_head,
    )?;
    require!(
        !ctx.accounts.issue_commitment.publication_removed,
        NagarikSignalV2Error::IssueRemoved
    );
    require!(
        ctx.accounts.issue_commitment.lifecycle == expected_lifecycle,
        NagarikSignalV2Error::StaleLifecycle
    );
    require!(
        valid_lifecycle(new_lifecycle),
        NagarikSignalV2Error::InvalidLifecycle
    );
    require!(
        valid_lifecycle_transition(expected_lifecycle, new_lifecycle),
        NagarikSignalV2Error::InvalidLifecycleTransition
    );
    require!(
        nonzero_hash(&event_id) && nonzero_hash(&payload_hash),
        NagarikSignalV2Error::ZeroCommitment
    );

    let now = Clock::get()?.unix_timestamp;
    let sequence = next_sequence(expected_update_count)?;
    let issue = &ctx.accounts.issue_commitment;
    let (event, new_head) = build_event(EventInput {
        issue: issue.key(),
        issue_key: issue.issue_key,
        event_id,
        event_type: EVENT_LIFECYCLE_CHANGED,
        category: issue.category,
        sequence,
        previous_head: expected_timeline_head,
        payload_hash,
        metadata_hash: issue.metadata_hash,
        evidence_hash: issue.evidence_hash,
        location_hash: issue.location_hash,
        lifecycle: new_lifecycle,
        publication_removed: false,
        occurred_at: now,
        actor: ctx.accounts.actor.key(),
        bump: ctx.bumps.commitment_event,
    });
    ctx.accounts.commitment_event.set_inner(event);
    let issue = &mut ctx.accounts.issue_commitment;
    issue.lifecycle = new_lifecycle;
    issue.timeline_head = new_head;
    issue.update_count = sequence;
    issue.updated_at = now;
    Ok(())
}

pub fn checkpoint_handoff(
    ctx: Context<AppendIssueEvent>,
    event_id: [u8; 32],
    expected_update_count: u64,
    expected_timeline_head: [u8; 32],
    expected_handoff_head: [u8; 32],
    payload_hash: [u8; 32],
) -> Result<()> {
    validate_protocol_and_role(
        &ctx.accounts.protocol_config,
        ctx.accounts.protocol_config.key(),
        &ctx.accounts.role_grant,
        ctx.accounts.actor.key(),
        ROLE_HANDOFF_WRITER,
    )?;
    validate_append(
        &ctx.accounts.issue_commitment,
        expected_update_count,
        &expected_timeline_head,
        &expected_handoff_head,
    )?;
    require!(
        !ctx.accounts.issue_commitment.publication_removed,
        NagarikSignalV2Error::IssueRemoved
    );
    require!(
        nonzero_hash(&event_id) && nonzero_hash(&payload_hash),
        NagarikSignalV2Error::ZeroCommitment
    );

    let now = Clock::get()?.unix_timestamp;
    let sequence = next_sequence(expected_update_count)?;
    let issue = &ctx.accounts.issue_commitment;
    let (event, new_head) = build_event(EventInput {
        issue: issue.key(),
        issue_key: issue.issue_key,
        event_id,
        event_type: EVENT_HANDOFF_CHECKPOINTED,
        category: issue.category,
        sequence,
        previous_head: expected_handoff_head,
        payload_hash,
        metadata_hash: issue.metadata_hash,
        evidence_hash: issue.evidence_hash,
        location_hash: issue.location_hash,
        lifecycle: issue.lifecycle,
        publication_removed: false,
        occurred_at: now,
        actor: ctx.accounts.actor.key(),
        bump: ctx.bumps.commitment_event,
    });
    ctx.accounts.commitment_event.set_inner(event);
    let issue = &mut ctx.accounts.issue_commitment;
    issue.handoff_head = new_head;
    issue.update_count = sequence;
    issue.updated_at = now;
    Ok(())
}

pub fn mark_publication_removed(
    ctx: Context<AppendIssueEvent>,
    event_id: [u8; 32],
    expected_update_count: u64,
    expected_timeline_head: [u8; 32],
    expected_handoff_head: [u8; 32],
    payload_hash: [u8; 32],
    tombstone_metadata_hash: [u8; 32],
) -> Result<()> {
    validate_protocol_and_role(
        &ctx.accounts.protocol_config,
        ctx.accounts.protocol_config.key(),
        &ctx.accounts.role_grant,
        ctx.accounts.actor.key(),
        ROLE_REMOVAL_WRITER,
    )?;
    validate_append(
        &ctx.accounts.issue_commitment,
        expected_update_count,
        &expected_timeline_head,
        &expected_handoff_head,
    )?;
    require!(
        !ctx.accounts.issue_commitment.publication_removed,
        NagarikSignalV2Error::PublicationAlreadyRemoved
    );
    require!(
        nonzero_hash(&event_id)
            && nonzero_hash(&payload_hash)
            && nonzero_hash(&tombstone_metadata_hash),
        NagarikSignalV2Error::ZeroCommitment
    );

    let now = Clock::get()?.unix_timestamp;
    let sequence = next_sequence(expected_update_count)?;
    let issue = &ctx.accounts.issue_commitment;
    let (event, new_head) = build_event(EventInput {
        issue: issue.key(),
        issue_key: issue.issue_key,
        event_id,
        event_type: EVENT_PUBLICATION_REMOVED,
        category: issue.category,
        sequence,
        previous_head: expected_timeline_head,
        payload_hash,
        metadata_hash: tombstone_metadata_hash,
        evidence_hash: issue.evidence_hash,
        location_hash: issue.location_hash,
        lifecycle: issue.lifecycle,
        publication_removed: true,
        occurred_at: now,
        actor: ctx.accounts.actor.key(),
        bump: ctx.bumps.commitment_event,
    });
    ctx.accounts.commitment_event.set_inner(event);
    let issue = &mut ctx.accounts.issue_commitment;
    issue.publication_removed = true;
    issue.metadata_hash = tombstone_metadata_hash;
    issue.timeline_head = new_head;
    issue.update_count = sequence;
    issue.updated_at = now;
    Ok(())
}

fn validate_protocol_and_role(
    config: &ProtocolConfig,
    config_key: Pubkey,
    grant: &RoleGrant,
    actor: Pubkey,
    required_role: u16,
) -> Result<()> {
    require!(
        config.version == PROTOCOL_VERSION,
        NagarikSignalV2Error::InvalidProtocolVersion
    );
    require!(!config.paused, NagarikSignalV2Error::ProtocolPaused);
    require_keys_eq!(
        grant.protocol,
        config_key,
        NagarikSignalV2Error::InvalidRoleGrant
    );
    require_keys_eq!(grant.subject, actor, NagarikSignalV2Error::InvalidRoleGrant);
    require!(
        grant.active && grant.role_bits & required_role == required_role,
        NagarikSignalV2Error::RequiredRoleMissing
    );
    Ok(())
}

fn validate_append(
    issue: &IssueCommitment,
    expected_update_count: u64,
    expected_timeline_head: &[u8; 32],
    expected_handoff_head: &[u8; 32],
) -> Result<()> {
    require!(
        issue.update_count == expected_update_count,
        NagarikSignalV2Error::StaleUpdateCount
    );
    require!(
        issue.timeline_head == *expected_timeline_head
            && issue.handoff_head == *expected_handoff_head,
        NagarikSignalV2Error::StaleHead
    );
    require!(
        issue.update_count < MAX_SEQUENCE,
        NagarikSignalV2Error::SequenceExhausted
    );
    Ok(())
}

fn next_sequence(expected_update_count: u64) -> Result<u64> {
    expected_update_count
        .checked_add(1)
        .ok_or_else(|| error!(NagarikSignalV2Error::ArithmeticOverflow))
}

struct EventInput {
    issue: Pubkey,
    issue_key: [u8; 32],
    event_id: [u8; 32],
    event_type: u8,
    category: u8,
    sequence: u64,
    previous_head: [u8; 32],
    payload_hash: [u8; 32],
    metadata_hash: [u8; 32],
    evidence_hash: [u8; 32],
    location_hash: [u8; 32],
    lifecycle: u8,
    publication_removed: bool,
    occurred_at: i64,
    actor: Pubkey,
    bump: u8,
}

fn build_event(input: EventInput) -> (CommitmentEvent, [u8; 32]) {
    let sequence = input.sequence.to_le_bytes();
    let removed = [u8::from(input.publication_removed)];
    let event_type = [input.event_type];
    let category = [input.category];
    let lifecycle = [input.lifecycle];
    let record_hash = hashv(&[
        EVENT_RECORD_DOMAIN,
        &input.issue_key,
        &input.event_id,
        &event_type,
        &category,
        &sequence,
        &input.payload_hash,
        &input.metadata_hash,
        &input.evidence_hash,
        &input.location_hash,
        &lifecycle,
        &removed,
    ])
    .to_bytes();
    let domain = if input.event_type == EVENT_HANDOFF_CHECKPOINTED {
        HANDOFF_DOMAIN
    } else {
        TIMELINE_DOMAIN
    };
    let new_head = hashv(&[
        domain,
        &input.previous_head,
        &input.event_id,
        &event_type,
        &record_hash,
    ])
    .to_bytes();
    (
        CommitmentEvent {
            issue: input.issue,
            event_id: input.event_id,
            event_type: input.event_type,
            category: input.category,
            sequence: input.sequence,
            previous_head: input.previous_head,
            new_head,
            payload_hash: input.payload_hash,
            metadata_hash: input.metadata_hash,
            issue_evidence_hash: input.evidence_hash,
            location_hash: input.location_hash,
            lifecycle: input.lifecycle,
            publication_removed: input.publication_removed,
            occurred_at: input.occurred_at,
            actor: input.actor,
            bump: input.bump,
            reserved: [0; 15],
        },
        new_head,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::GENESIS_AUTHORITY;

    #[test]
    fn event_record_and_stream_heads_are_deterministic() {
        let input = EventInput {
            issue: Pubkey::new_from_array([9; 32]),
            issue_key: [1; 32],
            event_id: [2; 32],
            event_type: EVENT_ISSUE_CREATED,
            category: 2,
            sequence: 1,
            previous_head: [0; 32],
            payload_hash: [3; 32],
            metadata_hash: [4; 32],
            evidence_hash: [5; 32],
            location_hash: [6; 32],
            lifecycle: LIFECYCLE_OPEN,
            publication_removed: false,
            occurred_at: 1,
            actor: Pubkey::new_from_array([8; 32]),
            bump: 255,
        };
        let (event, head) = build_event(input);
        assert_eq!(event.new_head, head);
        assert_eq!(
            hex(&head),
            "28c445a308a0441b5419981e6fb66e7fcba32007f9dd668ceb2805bb7c6ebb51"
        );
    }

    #[test]
    fn ids_and_pdas_match_the_typescript_vectors() {
        let public_issue_uuid = [
            0x6f, 0x62, 0x86, 0x2a, 0xc3, 0xd3, 0x47, 0x58, 0xbd, 0x40, 0x30, 0x12, 0xab, 0x63,
            0xab, 0x86,
        ];
        let database_event_uuid = [
            0x2e, 0xf9, 0xaf, 0x1c, 0xe6, 0x2e, 0x4d, 0x37, 0x8e, 0x09, 0xf5, 0x76, 0xde, 0x20,
            0x33, 0xd5,
        ];
        let event_type = [EVENT_ISSUE_CREATED];
        let issue_key = hashv(&[b"nagarik:v2:issue\0", &public_issue_uuid]).to_bytes();
        let event_id = hashv(&[
            b"nagarik:v2:event\0",
            &issue_key,
            &database_event_uuid,
            &event_type,
        ])
        .to_bytes();
        let operation_id = hashv(&[
            b"nagarik:v2:operation\0",
            &issue_key,
            &event_id,
            &event_type,
        ])
        .to_bytes();
        assert_eq!(
            hex(&issue_key),
            "96bab5dff162d28490e964b22cbb9f95098af6fa300ca32bbf417c6e9efaa27f"
        );
        assert_eq!(
            hex(&event_id),
            "0634e4b9eabaeebf84423273d93bc3709b064262b976652a1f53e105acbeeafe"
        );
        assert_eq!(
            hex(&operation_id),
            "c7aa444975db43b06ad0d546d9ada4ad6dce875e578d919a108c368462e56848"
        );

        let (protocol, protocol_bump) = Pubkey::find_program_address(
            &[ProtocolConfig::SEED_PREFIX, ProtocolConfig::SEED_VERSION],
            &crate::ID,
        );
        let (role, role_bump) = Pubkey::find_program_address(
            &[
                RoleGrant::SEED_PREFIX,
                protocol.as_ref(),
                GENESIS_AUTHORITY.as_ref(),
            ],
            &crate::ID,
        );
        let (issue, issue_bump) = Pubkey::find_program_address(
            &[IssueCommitment::SEED_PREFIX, protocol.as_ref(), &issue_key],
            &crate::ID,
        );
        let (event, event_bump) = Pubkey::find_program_address(
            &[CommitmentEvent::SEED_PREFIX, issue.as_ref(), &event_id],
            &crate::ID,
        );
        assert_eq!(
            (
                protocol.to_string(),
                protocol_bump,
                role.to_string(),
                role_bump,
                issue.to_string(),
                issue_bump,
                event.to_string(),
                event_bump,
            ),
            (
                "B1u7TxnDJtmh6CRugrSYQiRhanDzJXGMoJw5DkgH1ftL".to_owned(),
                254,
                "3BmgpH5ubs9ufpFRJ2R5inDbqESEoFKpdPDNYkbABKBX".to_owned(),
                254,
                "5vKnvo9rayumgpb2GgaT7jx5jyzsRowJWRxfq3eDPHJ3".to_owned(),
                254,
                "CBZdhpXQ5tpJKYXyRZAMkzkQC2NmeHDjyrDppPJfebUu".to_owned(),
                251,
            )
        );
    }

    #[test]
    fn account_rent_vectors_cover_every_fixed_layout() {
        let rent = Rent::default();
        assert_eq!(rent.minimum_balance(ProtocolConfig::LEN), 1_865_280);
        assert_eq!(rent.minimum_balance(RoleGrant::LEN), 1_753_920);
        assert_eq!(rent.minimum_balance(IssueCommitment::LEN), 3_145_920);
        assert_eq!(rent.minimum_balance(CommitmentEvent::LEN), 3_201_600);
    }

    fn hex(bytes: &[u8]) -> String {
        bytes.iter().map(|byte| format!("{byte:02x}")).collect()
    }
}
