use anchor_lang::prelude::*;

#[event]
pub struct ProtocolInitialized {
    pub protocol: Pubkey,
    pub authority: Pubkey,
    pub config_revision: u64,
}

#[event]
pub struct RoleGrantChanged {
    pub protocol: Pubkey,
    pub authority: Pubkey,
    pub subject: Pubkey,
    pub role_bits: u16,
    pub active: bool,
    pub grant_revision: u64,
    pub config_revision: u64,
}

#[event]
pub struct PauseChanged {
    pub protocol: Pubkey,
    pub authority: Pubkey,
    pub paused: bool,
    pub config_revision: u64,
}

#[event]
pub struct AuthorityProposed {
    pub protocol: Pubkey,
    pub current_authority: Pubkey,
    pub pending_authority: Pubkey,
    pub config_revision: u64,
}

#[event]
pub struct AuthorityProposalCancelled {
    pub protocol: Pubkey,
    pub authority: Pubkey,
    pub cancelled_pending_authority: Pubkey,
    pub config_revision: u64,
}

#[event]
pub struct AuthorityAccepted {
    pub protocol: Pubkey,
    pub previous_authority: Pubkey,
    pub new_authority: Pubkey,
    pub config_revision: u64,
}
