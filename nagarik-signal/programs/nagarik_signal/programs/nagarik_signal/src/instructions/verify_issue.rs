use anchor_lang::prelude::*;

use crate::errors::NagarikSignalError;
use crate::events::IssueVerified;
use crate::state::{closed_status, Issue, Verification, STATUS_SUBMITTED, STATUS_VERIFIED};

#[derive(Accounts)]
#[instruction(issue_id: u64)]
pub struct VerifyIssue<'info> {
    #[account(
        mut,
        seeds = [Issue::SEED_PREFIX, &issue_id.to_le_bytes()],
        bump = issue.bump
    )]
    pub issue: Account<'info, Issue>,

    #[account(mut)]
    pub verifier: Signer<'info>,

    #[account(
        init,
        payer = verifier,
        space = Verification::SIZE,
        seeds = [Verification::SEED_PREFIX, issue.key().as_ref(), verifier.key().as_ref()],
        bump
    )]
    pub verification: Account<'info, Verification>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<VerifyIssue>, issue_id: u64) -> Result<()> {
    require!(ctx.accounts.issue.id == issue_id, NagarikSignalError::InvalidSequence);
    require!(ctx.accounts.issue.reporter != ctx.accounts.verifier.key(), NagarikSignalError::SelfVerificationNotAllowed);
    require!(!closed_status(ctx.accounts.issue.status), NagarikSignalError::IssueClosed);

    let now = Clock::get()?.unix_timestamp;
    let issue = &mut ctx.accounts.issue;
    let verification = &mut ctx.accounts.verification;

    issue.verification_count = issue
        .verification_count
        .checked_add(1)
        .ok_or(NagarikSignalError::ArithmeticOverflow)?;
    if issue.status == STATUS_SUBMITTED && issue.verification_count >= 2 {
        issue.status = STATUS_VERIFIED;
    }
    issue.updated_at = now;

    verification.issue = issue.key();
    verification.verifier = ctx.accounts.verifier.key();
    verification.created_at = now;
    verification.bump = ctx.bumps.verification;

    emit!(IssueVerified {
        issue: issue.key(),
        verifier: verification.verifier,
        verification_count: issue.verification_count,
        created_at: now,
    });

    Ok(())
}
