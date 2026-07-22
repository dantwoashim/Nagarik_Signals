use anchor_lang::prelude::*;
use anchor_lang::solana_program::hash::hashv;

use crate::errors::NagarikSignalError;
use crate::events::StatusUpdated;
use crate::state::{valid_status, Issue, StatusUpdate, Steward, STATUS_RESOLVED};

#[derive(Accounts)]
#[instruction(seq: u32)]
pub struct UpdateStatus<'info> {
    #[account(
        mut,
        seeds = [Issue::SEED_PREFIX, &issue.id.to_le_bytes()],
        bump = issue.bump
    )]
    pub issue: Account<'info, Issue>,

    #[account(
        seeds = [Steward::SEED_PREFIX, updater.key().as_ref()],
        bump = steward.bump,
        constraint = steward.wallet == updater.key() @ NagarikSignalError::UnauthorizedSteward
    )]
    pub steward: Account<'info, Steward>,

    #[account(mut)]
    pub updater: Signer<'info>,

    #[account(
        init,
        payer = updater,
        space = StatusUpdate::SIZE,
        seeds = [StatusUpdate::SEED_PREFIX, issue.key().as_ref(), &seq.to_le_bytes()],
        bump
    )]
    pub status_update: Account<'info, StatusUpdate>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<UpdateStatus>,
    seq: u32,
    new_status: u8,
    proof_hash: [u8; 32],
) -> Result<()> {
    require!(ctx.accounts.steward.active, NagarikSignalError::StewardInactive);
    require!(valid_status(new_status), NagarikSignalError::InvalidStatus);
    require!(proof_hash != [0; 32], NagarikSignalError::InvalidHash);
    require!(seq == ctx.accounts.issue.update_count + 1, NagarikSignalError::InvalidSequence);
    require!(new_status != STATUS_RESOLVED || proof_hash != [0; 32], NagarikSignalError::ResolutionProofRequired);

    let now = Clock::get()?.unix_timestamp;
    let issue_key = ctx.accounts.issue.key();
    let updater_key = ctx.accounts.updater.key();
    let issue = &mut ctx.accounts.issue;
    let old_status = issue.status;
    let previous_timeline_hash = issue.timeline_hash;
    let seq_bytes = seq.to_le_bytes();
    let now_bytes = now.to_le_bytes();
    let old_status_bytes = [old_status];
    let new_status_bytes = [new_status];
    let new_timeline_hash = hashv(&[
        b"nagarik:status:v1",
        issue_key.as_ref(),
        &seq_bytes,
        updater_key.as_ref(),
        &old_status_bytes,
        &new_status_bytes,
        proof_hash.as_ref(),
        previous_timeline_hash.as_ref(),
        &now_bytes,
    ])
    .to_bytes();

    issue.status = new_status;
    issue.update_count = seq;
    issue.updated_at = now;
    issue.timeline_hash = new_timeline_hash;
    if new_status == STATUS_RESOLVED {
        issue.resolved_at = now;
        issue.resolution_hash = proof_hash;
    }

    let status_update = &mut ctx.accounts.status_update;
    status_update.issue = issue.key();
    status_update.seq = seq;
    status_update.updater = ctx.accounts.updater.key();
    status_update.old_status = old_status;
    status_update.new_status = new_status;
    status_update.proof_hash = proof_hash;
    status_update.previous_timeline_hash = previous_timeline_hash;
    status_update.new_timeline_hash = new_timeline_hash;
    status_update.created_at = now;
    status_update.bump = ctx.bumps.status_update;

    emit!(StatusUpdated {
        issue: issue.key(),
        updater: status_update.updater,
        old_status,
        new_status,
        seq,
        created_at: now,
    });

    Ok(())
}
