use anchor_lang::prelude::*;

use crate::errors::NagarikSignalError;
use crate::state::{Registry, Steward};

#[derive(Accounts)]
pub struct RevokeSteward<'info> {
    #[account(
        seeds = [Registry::SEED_PREFIX],
        bump = registry.bump,
        has_one = authority @ NagarikSignalError::UnauthorizedSteward
    )]
    pub registry: Account<'info, Registry>,

    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [Steward::SEED_PREFIX, steward.wallet.as_ref()],
        bump = steward.bump
    )]
    pub steward: Account<'info, Steward>,
}

pub fn handler(ctx: Context<RevokeSteward>) -> Result<()> {
    let steward = &mut ctx.accounts.steward;
    steward.active = false;
    steward.revoked_at = Clock::get()?.unix_timestamp;
    Ok(())
}
