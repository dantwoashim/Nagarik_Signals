use anchor_lang::prelude::*;

use crate::errors::NagarikSignalError;
use crate::state::{Registry, Steward};

#[derive(Accounts)]
pub struct AddSteward<'info> {
    #[account(
        seeds = [Registry::SEED_PREFIX],
        bump = registry.bump,
        has_one = authority @ NagarikSignalError::UnauthorizedSteward
    )]
    pub registry: Account<'info, Registry>,

    #[account(mut)]
    pub authority: Signer<'info>,

    /// CHECK: Wallet that will be allowed to update issue status.
    pub wallet: UncheckedAccount<'info>,

    #[account(
        init,
        payer = authority,
        space = Steward::SIZE,
        seeds = [Steward::SEED_PREFIX, wallet.key().as_ref()],
        bump
    )]
    pub steward: Account<'info, Steward>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<AddSteward>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let steward = &mut ctx.accounts.steward;
    steward.wallet = ctx.accounts.wallet.key();
    steward.active = true;
    steward.created_at = now;
    steward.revoked_at = 0;
    steward.bump = ctx.bumps.steward;
    Ok(())
}
