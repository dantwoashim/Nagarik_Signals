use anchor_lang::prelude::*;

#[event]
pub struct IssueCreated {
    pub issue: Pubkey,
    pub issue_id: u64,
    pub reporter: Pubkey,
    pub category: u8,
    pub created_at: i64,
}

#[event]
pub struct IssueVerified {
    pub issue: Pubkey,
    pub verifier: Pubkey,
    pub verification_count: u32,
    pub created_at: i64,
}

#[event]
pub struct StatusUpdated {
    pub issue: Pubkey,
    pub updater: Pubkey,
    pub old_status: u8,
    pub new_status: u8,
    pub seq: u32,
    pub created_at: i64,
}
