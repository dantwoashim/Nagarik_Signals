use anchor_lang::prelude::*;
use anchor_lang::solana_program::hash::hashv;

use crate::errors::NagarikSignalError;
use crate::events::IssueCreated;
use crate::state::{valid_category, Issue, Registry, STATUS_SUBMITTED};

#[derive(Accounts)]
#[instruction(issue_id: u64)]
pub struct CreateIssue<'info> {
    #[account(
        mut,
        seeds = [Registry::SEED_PREFIX],
        bump = registry.bump
    )]
    pub registry: Account<'info, Registry>,

    #[account(mut)]
    pub reporter: Signer<'info>,

    #[account(
        init,
        payer = reporter,
        space = Issue::SIZE,
        seeds = [Issue::SEED_PREFIX, &issue_id.to_le_bytes()],
        bump
    )]
    pub issue: Account<'info, Issue>,

    pub system_program: Program<'info, System>,
}

pub fn handler(
    ctx: Context<CreateIssue>,
    issue_id: u64,
    category: u8,
    first_observed_at: i64,
    metadata_hash: [u8; 32],
    evidence_hash: [u8; 32],
    location_hash: [u8; 32],
) -> Result<()> {
    require!(issue_id == ctx.accounts.registry.issue_count + 1, NagarikSignalError::InvalidSequence);
    require!(valid_category(category), NagarikSignalError::InvalidCategory);
    require!(metadata_hash != [0; 32], NagarikSignalError::InvalidHash);
    require!(evidence_hash != [0; 32], NagarikSignalError::InvalidHash);
    require!(location_hash != [0; 32], NagarikSignalError::InvalidHash);

    let now = Clock::get()?.unix_timestamp;
    require!(first_observed_at <= now + 300, NagarikSignalError::InvalidObservedDate);
    require!(first_observed_at >= now - 180 * 86_400, NagarikSignalError::InvalidObservedDate);

    let reporter_key = ctx.accounts.reporter.key();
    let issue = &mut ctx.accounts.issue;
    issue.id = issue_id;
    issue.reporter = ctx.accounts.reporter.key();
    issue.category = category;
    issue.status = STATUS_SUBMITTED;
    issue.first_observed_at = first_observed_at;
    issue.created_at = now;
    issue.updated_at = now;
    issue.resolved_at = 0;
    issue.metadata_hash = metadata_hash;
    issue.evidence_hash = evidence_hash;
    issue.location_hash = location_hash;
    issue.verification_count = 0;
    issue.update_count = 0;
    let issue_id_bytes = issue_id.to_le_bytes();
    let first_observed_at_bytes = first_observed_at.to_le_bytes();
    let created_at_bytes = now.to_le_bytes();
    let category_bytes = [category];
    issue.timeline_hash = hashv(&[
        b"nagarik:issue:v1",
        &issue_id_bytes,
        reporter_key.as_ref(),
        &category_bytes,
        &first_observed_at_bytes,
        &created_at_bytes,
        metadata_hash.as_ref(),
        evidence_hash.as_ref(),
        location_hash.as_ref(),
    ])
    .to_bytes();
    issue.resolution_hash = [0; 32];
    issue.bump = ctx.bumps.issue;

    ctx.accounts.registry.issue_count = issue_id;

    emit!(IssueCreated {
        issue: issue.key(),
        issue_id,
        reporter: issue.reporter,
        category,
        created_at: now,
    });

    Ok(())
}
