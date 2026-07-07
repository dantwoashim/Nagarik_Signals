#![allow(unexpected_cfgs)]

use anchor_lang::prelude::*;

pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("76PwNDW9hANj3tiebTEUdAj4yHYHVMfjcVDPjUWLQmqY");

#[program]
pub mod nagarik_signal {
    use super::*;

    pub fn initialize_registry(ctx: Context<InitializeRegistry>) -> Result<()> {
        instructions::initialize_registry::handler(ctx)
    }

    pub fn add_steward(ctx: Context<AddSteward>) -> Result<()> {
        instructions::add_steward::handler(ctx)
    }

    pub fn revoke_steward(ctx: Context<RevokeSteward>) -> Result<()> {
        instructions::revoke_steward::handler(ctx)
    }

    pub fn create_issue(
        ctx: Context<CreateIssue>,
        issue_id: u64,
        category: u8,
        first_observed_at: i64,
        metadata_hash: [u8; 32],
        evidence_hash: [u8; 32],
        location_hash: [u8; 32],
    ) -> Result<()> {
        instructions::create_issue::handler(
            ctx,
            issue_id,
            category,
            first_observed_at,
            metadata_hash,
            evidence_hash,
            location_hash,
        )
    }

    pub fn verify_issue(ctx: Context<VerifyIssue>, issue_id: u64) -> Result<()> {
        instructions::verify_issue::handler(ctx, issue_id)
    }

    pub fn update_status(
        ctx: Context<UpdateStatus>,
        seq: u32,
        new_status: u8,
        proof_hash: [u8; 32],
    ) -> Result<()> {
        instructions::update_status::handler(ctx, seq, new_status, proof_hash)
    }
}
