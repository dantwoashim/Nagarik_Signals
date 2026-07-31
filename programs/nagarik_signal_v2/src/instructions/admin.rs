use anchor_lang::prelude::*;

use crate::errors::NagarikSignalV2Error;
use crate::events::{
    AuthorityAccepted, AuthorityProposalCancelled, AuthorityProposed, PauseChanged,
    ProtocolInitialized, RoleGrantChanged,
};
use crate::state::{
    valid_role_bits, ProtocolConfig, RoleGrant, GENESIS_AUTHORITY, PROTOCOL_VERSION,
};

#[derive(Accounts)]
pub struct InitializeProtocol<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    pub genesis_authority: Signer<'info>,
    #[account(
        init,
        payer = payer,
        space = ProtocolConfig::LEN,
        seeds = [ProtocolConfig::SEED_PREFIX, ProtocolConfig::SEED_VERSION],
        bump
    )]
    pub protocol_config: Account<'info, ProtocolConfig>,
    pub system_program: Program<'info, System>,
}

pub fn initialize_protocol(ctx: Context<InitializeProtocol>) -> Result<()> {
    require_keys_eq!(
        ctx.accounts.genesis_authority.key(),
        GENESIS_AUTHORITY,
        NagarikSignalV2Error::InvalidGenesisAuthority
    );
    let config = &mut ctx.accounts.protocol_config;
    config.version = PROTOCOL_VERSION;
    config.authority = GENESIS_AUTHORITY;
    config.pending_authority = None;
    config.paused = true;
    config.revision = 1;
    config.bump = ctx.bumps.protocol_config;
    config.reserved = [0; 56];

    emit!(ProtocolInitialized {
        protocol: config.key(),
        authority: config.authority,
        config_revision: config.revision,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct SetRole<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [ProtocolConfig::SEED_PREFIX, ProtocolConfig::SEED_VERSION],
        bump = protocol_config.bump
    )]
    pub protocol_config: Account<'info, ProtocolConfig>,
    /// CHECK: The public key is the role subject and carries no trusted data.
    pub subject: UncheckedAccount<'info>,
    #[account(
        init_if_needed,
        payer = authority,
        space = RoleGrant::LEN,
        seeds = [
            RoleGrant::SEED_PREFIX,
            protocol_config.key().as_ref(),
            subject.key().as_ref()
        ],
        bump
    )]
    pub role_grant: Account<'info, RoleGrant>,
    pub system_program: Program<'info, System>,
}

pub fn set_role(
    ctx: Context<SetRole>,
    expected_config_revision: u64,
    expected_grant_revision: u64,
    role_bits: u16,
    active: bool,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    let config_key = ctx.accounts.protocol_config.key();
    let subject_key = ctx.accounts.subject.key();
    require!(
        subject_key != Pubkey::default(),
        NagarikSignalV2Error::InvalidAuthority
    );
    validate_admin(
        &ctx.accounts.protocol_config,
        ctx.accounts.authority.key(),
        expected_config_revision,
    )?;

    let grant = &mut ctx.accounts.role_grant;
    let missing = grant.protocol == Pubkey::default();
    if missing {
        require!(
            expected_grant_revision == 0,
            NagarikSignalV2Error::StaleGrantRevision
        );
        require!(active, NagarikSignalV2Error::InvalidRoleChange);
        require!(
            valid_role_bits(role_bits),
            NagarikSignalV2Error::InvalidRoleBits
        );
        grant.protocol = config_key;
        grant.subject = subject_key;
        grant.role_bits = role_bits;
        grant.active = true;
        grant.granted_at = now;
        grant.revoked_at = 0;
        grant.revision = 1;
        grant.bump = ctx.bumps.role_grant;
        grant.reserved = [0; 24];
    } else {
        require_keys_eq!(
            grant.protocol,
            config_key,
            NagarikSignalV2Error::InvalidRoleGrant
        );
        require_keys_eq!(
            grant.subject,
            subject_key,
            NagarikSignalV2Error::InvalidRoleGrant
        );
        require!(
            grant.revision == expected_grant_revision,
            NagarikSignalV2Error::StaleGrantRevision
        );
        require!(
            grant.active != active || grant.role_bits != role_bits,
            NagarikSignalV2Error::RoleStateUnchanged
        );

        if !active {
            require!(grant.active, NagarikSignalV2Error::InvalidRoleChange);
            require!(
                role_bits == grant.role_bits,
                NagarikSignalV2Error::InvalidRoleChange
            );
            grant.active = false;
            grant.revoked_at = now;
        } else {
            require!(
                ctx.accounts.protocol_config.paused,
                NagarikSignalV2Error::InvalidRoleChange
            );
            require!(
                valid_role_bits(role_bits),
                NagarikSignalV2Error::InvalidRoleBits
            );
            grant.role_bits = role_bits;
            grant.active = true;
            grant.granted_at = now;
            grant.revoked_at = 0;
        }
        grant.revision = grant
            .revision
            .checked_add(1)
            .ok_or(NagarikSignalV2Error::ArithmeticOverflow)?;
    }

    let config = &mut ctx.accounts.protocol_config;
    config.revision = config
        .revision
        .checked_add(1)
        .ok_or(NagarikSignalV2Error::ArithmeticOverflow)?;
    emit!(RoleGrantChanged {
        protocol: config_key,
        authority: ctx.accounts.authority.key(),
        subject: subject_key,
        role_bits: grant.role_bits,
        active: grant.active,
        grant_revision: grant.revision,
        config_revision: config.revision,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct ConfigureProtocol<'info> {
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [ProtocolConfig::SEED_PREFIX, ProtocolConfig::SEED_VERSION],
        bump = protocol_config.bump
    )]
    pub protocol_config: Account<'info, ProtocolConfig>,
}

pub fn set_pause(
    ctx: Context<ConfigureProtocol>,
    expected_config_revision: u64,
    paused: bool,
) -> Result<()> {
    validate_admin(
        &ctx.accounts.protocol_config,
        ctx.accounts.authority.key(),
        expected_config_revision,
    )?;
    require!(
        ctx.accounts.protocol_config.paused != paused,
        NagarikSignalV2Error::PauseStateUnchanged
    );
    if !paused {
        require!(
            ctx.accounts.protocol_config.pending_authority.is_none(),
            NagarikSignalV2Error::InvalidAuthorityTransfer
        );
    }
    let config = &mut ctx.accounts.protocol_config;
    config.paused = paused;
    increment_revision(config)?;
    emit!(PauseChanged {
        protocol: config.key(),
        authority: ctx.accounts.authority.key(),
        paused,
        config_revision: config.revision,
    });
    Ok(())
}

pub fn propose_authority(
    ctx: Context<ConfigureProtocol>,
    expected_config_revision: u64,
    new_authority: Pubkey,
) -> Result<()> {
    validate_admin(
        &ctx.accounts.protocol_config,
        ctx.accounts.authority.key(),
        expected_config_revision,
    )?;
    require!(
        ctx.accounts.protocol_config.paused,
        NagarikSignalV2Error::ProtocolMustBePaused
    );
    require!(
        ctx.accounts.protocol_config.pending_authority.is_none(),
        NagarikSignalV2Error::InvalidAuthorityTransfer
    );
    require!(
        new_authority != Pubkey::default()
            && new_authority != ctx.accounts.protocol_config.authority,
        NagarikSignalV2Error::InvalidAuthority
    );
    let config = &mut ctx.accounts.protocol_config;
    config.pending_authority = Some(new_authority);
    increment_revision(config)?;
    emit!(AuthorityProposed {
        protocol: config.key(),
        current_authority: config.authority,
        pending_authority: new_authority,
        config_revision: config.revision,
    });
    Ok(())
}

pub fn cancel_authority_proposal(
    ctx: Context<ConfigureProtocol>,
    expected_config_revision: u64,
) -> Result<()> {
    validate_admin(
        &ctx.accounts.protocol_config,
        ctx.accounts.authority.key(),
        expected_config_revision,
    )?;
    require!(
        ctx.accounts.protocol_config.paused,
        NagarikSignalV2Error::ProtocolMustBePaused
    );
    let cancelled = ctx
        .accounts
        .protocol_config
        .pending_authority
        .ok_or(NagarikSignalV2Error::InvalidAuthorityTransfer)?;
    let config = &mut ctx.accounts.protocol_config;
    config.pending_authority = None;
    increment_revision(config)?;
    emit!(AuthorityProposalCancelled {
        protocol: config.key(),
        authority: ctx.accounts.authority.key(),
        cancelled_pending_authority: cancelled,
        config_revision: config.revision,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct AcceptAuthority<'info> {
    pub pending_authority: Signer<'info>,
    #[account(
        mut,
        seeds = [ProtocolConfig::SEED_PREFIX, ProtocolConfig::SEED_VERSION],
        bump = protocol_config.bump
    )]
    pub protocol_config: Account<'info, ProtocolConfig>,
}

pub fn accept_authority(
    ctx: Context<AcceptAuthority>,
    expected_config_revision: u64,
) -> Result<()> {
    let config = &mut ctx.accounts.protocol_config;
    require!(
        config.version == PROTOCOL_VERSION,
        NagarikSignalV2Error::InvalidProtocolVersion
    );
    require!(
        config.revision == expected_config_revision,
        NagarikSignalV2Error::StaleConfigRevision
    );
    require!(config.paused, NagarikSignalV2Error::ProtocolMustBePaused);
    let pending = config
        .pending_authority
        .ok_or(NagarikSignalV2Error::InvalidAuthorityTransfer)?;
    require_keys_eq!(
        pending,
        ctx.accounts.pending_authority.key(),
        NagarikSignalV2Error::UnauthorizedAuthority
    );
    let previous = config.authority;
    config.authority = pending;
    config.pending_authority = None;
    increment_revision(config)?;
    emit!(AuthorityAccepted {
        protocol: config.key(),
        previous_authority: previous,
        new_authority: pending,
        config_revision: config.revision,
    });
    Ok(())
}

fn validate_admin(
    config: &ProtocolConfig,
    authority: Pubkey,
    expected_revision: u64,
) -> Result<()> {
    require!(
        config.version == PROTOCOL_VERSION,
        NagarikSignalV2Error::InvalidProtocolVersion
    );
    require_keys_eq!(
        config.authority,
        authority,
        NagarikSignalV2Error::UnauthorizedAuthority
    );
    require!(
        config.revision == expected_revision,
        NagarikSignalV2Error::StaleConfigRevision
    );
    Ok(())
}

fn increment_revision(config: &mut ProtocolConfig) -> Result<()> {
    config.revision = config
        .revision
        .checked_add(1)
        .ok_or(NagarikSignalV2Error::ArithmeticOverflow)?;
    Ok(())
}
