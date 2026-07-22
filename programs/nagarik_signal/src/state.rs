use anchor_lang::prelude::*;

pub const STATUS_SUBMITTED: u8 = 0;
pub const STATUS_VERIFIED: u8 = 1;
pub const STATUS_IN_PROGRESS: u8 = 2;
pub const STATUS_RESOLVED: u8 = 3;
pub const STATUS_DISPUTED: u8 = 4;
pub const STATUS_REJECTED: u8 = 5;

#[account]
pub struct Registry {
    pub authority: Pubkey,
    pub issue_count: u64,
    pub created_at: i64,
    pub bump: u8,
}

impl Registry {
    pub const SEED_PREFIX: &'static [u8] = b"registry";
    pub const SIZE: usize = 8 + 32 + 8 + 8 + 1;
}

#[account]
pub struct Steward {
    pub wallet: Pubkey,
    pub active: bool,
    pub created_at: i64,
    pub revoked_at: i64,
    pub bump: u8,
}

impl Steward {
    pub const SEED_PREFIX: &'static [u8] = b"steward";
    pub const SIZE: usize = 8 + 32 + 1 + 8 + 8 + 1;
}

#[account]
pub struct Issue {
    pub id: u64,
    pub reporter: Pubkey,
    pub category: u8,
    pub status: u8,
    pub first_observed_at: i64,
    pub created_at: i64,
    pub updated_at: i64,
    pub resolved_at: i64,
    pub metadata_hash: [u8; 32],
    pub evidence_hash: [u8; 32],
    pub location_hash: [u8; 32],
    pub verification_count: u32,
    pub update_count: u32,
    pub timeline_hash: [u8; 32],
    pub resolution_hash: [u8; 32],
    pub bump: u8,
}

impl Issue {
    pub const SEED_PREFIX: &'static [u8] = b"issue";
    pub const SIZE: usize = 8 + 8 + 32 + 1 + 1 + 8 + 8 + 8 + 8 + 32 + 32 + 32 + 4 + 4 + 32 + 32 + 1;
}

#[account]
pub struct Verification {
    pub issue: Pubkey,
    pub verifier: Pubkey,
    pub created_at: i64,
    pub bump: u8,
}

impl Verification {
    pub const SEED_PREFIX: &'static [u8] = b"verification";
    pub const SIZE: usize = 8 + 32 + 32 + 8 + 1;
}

#[account]
pub struct StatusUpdate {
    pub issue: Pubkey,
    pub seq: u32,
    pub updater: Pubkey,
    pub old_status: u8,
    pub new_status: u8,
    pub proof_hash: [u8; 32],
    pub previous_timeline_hash: [u8; 32],
    pub new_timeline_hash: [u8; 32],
    pub created_at: i64,
    pub bump: u8,
}

impl StatusUpdate {
    pub const SEED_PREFIX: &'static [u8] = b"status_update";
    pub const SIZE: usize = 8 + 32 + 4 + 32 + 1 + 1 + 32 + 32 + 32 + 8 + 1;
}

pub fn valid_category(category: u8) -> bool {
    category <= 6
}

pub fn valid_status(status: u8) -> bool {
    status <= STATUS_REJECTED
}

pub fn closed_status(status: u8) -> bool {
    status == STATUS_RESOLVED || status == STATUS_REJECTED
}

pub fn valid_status_transition(old_status: u8, new_status: u8) -> bool {
    match old_status {
        STATUS_SUBMITTED => matches!(
            new_status,
            STATUS_VERIFIED
                | STATUS_IN_PROGRESS
                | STATUS_RESOLVED
                | STATUS_DISPUTED
                | STATUS_REJECTED
        ),
        STATUS_VERIFIED => matches!(
            new_status,
            STATUS_IN_PROGRESS | STATUS_RESOLVED | STATUS_DISPUTED | STATUS_REJECTED
        ),
        STATUS_IN_PROGRESS => matches!(
            new_status,
            STATUS_RESOLVED | STATUS_DISPUTED | STATUS_REJECTED
        ),
        STATUS_DISPUTED => matches!(
            new_status,
            STATUS_SUBMITTED
                | STATUS_VERIFIED
                | STATUS_IN_PROGRESS
                | STATUS_RESOLVED
                | STATUS_REJECTED
        ),
        STATUS_RESOLVED | STATUS_REJECTED => false,
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lifecycle_moves_forward_and_closed_states_are_terminal() {
        assert!(valid_status_transition(STATUS_SUBMITTED, STATUS_VERIFIED));
        assert!(valid_status_transition(STATUS_VERIFIED, STATUS_IN_PROGRESS));
        assert!(valid_status_transition(STATUS_IN_PROGRESS, STATUS_RESOLVED));
        assert!(valid_status_transition(STATUS_DISPUTED, STATUS_IN_PROGRESS));

        assert!(!valid_status_transition(STATUS_VERIFIED, STATUS_SUBMITTED));
        assert!(!valid_status_transition(
            STATUS_IN_PROGRESS,
            STATUS_VERIFIED
        ));
        assert!(!valid_status_transition(
            STATUS_RESOLVED,
            STATUS_IN_PROGRESS
        ));
        assert!(!valid_status_transition(STATUS_REJECTED, STATUS_SUBMITTED));
        assert!(!valid_status_transition(STATUS_SUBMITTED, STATUS_SUBMITTED));
    }
}
