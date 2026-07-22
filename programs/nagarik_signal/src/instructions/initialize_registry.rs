use anchor_lang::prelude::*;

use crate::state::Registry;

#[derive(Accounts)]
pub struct InitializeRegistry<'info> {
    #[account(
        init,
        payer = authority,
        space = Registry::SIZE,
        seeds = [Registry::SEED_PREFIX],
        bump
    )]
    pub registry: Account<'info, Registry>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitializeRegistry>) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let registry = &mut ctx.accounts.registry;
    registry.authority = ctx.accounts.authority.key();
    registry.issue_count = 0;
    registry.created_at = now;
    registry.bump = ctx.bumps.registry;
    Ok(())
}
