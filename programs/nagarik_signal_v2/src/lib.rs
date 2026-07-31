#![allow(unexpected_cfgs)]

use anchor_lang::prelude::*;

pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("A1PDikCUQekCAbc8CHcZgEFwxxhEyspfHGEbG7PX4URP");

#[program]
pub mod nagarik_signal_v2 {
    use super::*;

    pub fn initialize_protocol(ctx: Context<InitializeProtocol>) -> Result<()> {
        instructions::admin::initialize_protocol(ctx)
    }

    pub fn set_role(
        ctx: Context<SetRole>,
        expected_config_revision: u64,
        expected_grant_revision: u64,
        role_bits: u16,
        active: bool,
    ) -> Result<()> {
        instructions::admin::set_role(
            ctx,
            expected_config_revision,
            expected_grant_revision,
            role_bits,
            active,
        )
    }

    pub fn set_pause(
        ctx: Context<ConfigureProtocol>,
        expected_config_revision: u64,
        paused: bool,
    ) -> Result<()> {
        instructions::admin::set_pause(ctx, expected_config_revision, paused)
    }

    pub fn propose_authority(
        ctx: Context<ConfigureProtocol>,
        expected_config_revision: u64,
        new_authority: Pubkey,
    ) -> Result<()> {
        instructions::admin::propose_authority(ctx, expected_config_revision, new_authority)
    }

    pub fn cancel_authority_proposal(
        ctx: Context<ConfigureProtocol>,
        expected_config_revision: u64,
    ) -> Result<()> {
        instructions::admin::cancel_authority_proposal(ctx, expected_config_revision)
    }

    pub fn accept_authority(
        ctx: Context<AcceptAuthority>,
        expected_config_revision: u64,
    ) -> Result<()> {
        instructions::admin::accept_authority(ctx, expected_config_revision)
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
        instructions::issue::create_issue(
            ctx,
            issue_key,
            event_id,
            category,
            payload_hash,
            metadata_hash,
            evidence_hash,
            location_hash,
        )
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
        instructions::issue::commit_metadata_version(
            ctx,
            event_id,
            expected_update_count,
            expected_timeline_head,
            expected_handoff_head,
            expected_category,
            new_category,
            payload_hash,
            new_metadata_hash,
            new_evidence_hash,
            new_location_hash,
        )
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
        instructions::issue::append_lifecycle(
            ctx,
            event_id,
            expected_update_count,
            expected_timeline_head,
            expected_handoff_head,
            expected_lifecycle,
            new_lifecycle,
            payload_hash,
        )
    }

    pub fn checkpoint_handoff(
        ctx: Context<AppendIssueEvent>,
        event_id: [u8; 32],
        expected_update_count: u64,
        expected_timeline_head: [u8; 32],
        expected_handoff_head: [u8; 32],
        payload_hash: [u8; 32],
    ) -> Result<()> {
        instructions::issue::checkpoint_handoff(
            ctx,
            event_id,
            expected_update_count,
            expected_timeline_head,
            expected_handoff_head,
            payload_hash,
        )
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
        instructions::issue::mark_publication_removed(
            ctx,
            event_id,
            expected_update_count,
            expected_timeline_head,
            expected_handoff_head,
            payload_hash,
            tombstone_metadata_hash,
        )
    }
}
