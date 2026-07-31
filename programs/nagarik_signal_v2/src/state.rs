use anchor_lang::prelude::*;

#[constant]
pub const PROTOCOL_VERSION: u8 = 2;
pub const MAX_SEQUENCE: u64 = 9_007_199_254_740_991;

pub const CATEGORY_ROAD: u8 = 0;
pub const CATEGORY_WASTE: u8 = 1;
pub const CATEGORY_WATER: u8 = 2;
pub const CATEGORY_ELECTRICITY_LIGHTING: u8 = 3;
pub const CATEGORY_PUBLIC_FACILITY: u8 = 4;
pub const CATEGORY_PUBLIC_SAFETY_HAZARD: u8 = 5;
pub const CATEGORY_OTHER_PUBLIC_INFRASTRUCTURE: u8 = 6;

pub const LIFECYCLE_OPEN: u8 = 0;
pub const LIFECYCLE_IN_PROGRESS: u8 = 1;
pub const LIFECYCLE_RESOLVED: u8 = 2;
pub const LIFECYCLE_CLOSED: u8 = 3;
pub const LIFECYCLE_DISPUTED: u8 = 4;

pub const EVENT_ISSUE_CREATED: u8 = 0;
pub const EVENT_METADATA_VERSION_COMMITTED: u8 = 1;
pub const EVENT_LIFECYCLE_CHANGED: u8 = 2;
pub const EVENT_HANDOFF_CHECKPOINTED: u8 = 3;
pub const EVENT_PUBLICATION_REMOVED: u8 = 4;

pub const ROLE_ISSUE_ISSUER: u16 = 0x0001;
pub const ROLE_LIFECYCLE_WRITER: u16 = 0x0002;
pub const ROLE_HANDOFF_WRITER: u16 = 0x0004;
pub const ROLE_REMOVAL_WRITER: u16 = 0x0008;
pub const ROLE_ALL: u16 =
    ROLE_ISSUE_ISSUER | ROLE_LIFECYCLE_WRITER | ROLE_HANDOFF_WRITER | ROLE_REMOVAL_WRITER;

#[constant]
pub const GENESIS_AUTHORITY: Pubkey = Pubkey::new_from_array([
    119, 179, 129, 68, 197, 175, 3, 32, 234, 158, 13, 33, 203, 66, 55, 77, 21, 145, 65, 107, 205,
    240, 182, 254, 229, 174, 78, 10, 28, 222, 74, 181,
]);

#[account]
pub struct ProtocolConfig {
    pub version: u8,
    pub authority: Pubkey,
    pub pending_authority: Option<Pubkey>,
    pub paused: bool,
    pub revision: u64,
    pub bump: u8,
    pub reserved: [u8; 56],
}

impl ProtocolConfig {
    pub const SEED_PREFIX: &'static [u8] = b"protocol";
    pub const SEED_VERSION: &'static [u8] = b"v2";
    pub const LEN: usize = 140;
}

#[account]
pub struct RoleGrant {
    pub protocol: Pubkey,
    pub subject: Pubkey,
    pub role_bits: u16,
    pub active: bool,
    pub granted_at: i64,
    pub revoked_at: i64,
    pub revision: u64,
    pub bump: u8,
    pub reserved: [u8; 24],
}

impl RoleGrant {
    pub const SEED_PREFIX: &'static [u8] = b"role";
    pub const LEN: usize = 124;
}

#[account]
pub struct IssueCommitment {
    pub protocol: Pubkey,
    pub issue_key: [u8; 32],
    pub issuer: Pubkey,
    pub category: u8,
    pub lifecycle: u8,
    pub publication_removed: bool,
    pub metadata_hash: [u8; 32],
    pub evidence_hash: [u8; 32],
    pub location_hash: [u8; 32],
    pub timeline_head: [u8; 32],
    pub handoff_head: [u8; 32],
    pub update_count: u64,
    pub created_at: i64,
    pub updated_at: i64,
    pub bump: u8,
    pub reserved: [u8; 32],
}

impl IssueCommitment {
    pub const SEED_PREFIX: &'static [u8] = b"issue";
    pub const LEN: usize = 324;
}

#[account]
pub struct CommitmentEvent {
    pub issue: Pubkey,
    pub event_id: [u8; 32],
    pub event_type: u8,
    pub category: u8,
    pub sequence: u64,
    pub previous_head: [u8; 32],
    pub new_head: [u8; 32],
    pub payload_hash: [u8; 32],
    pub metadata_hash: [u8; 32],
    pub issue_evidence_hash: [u8; 32],
    pub location_hash: [u8; 32],
    pub lifecycle: u8,
    pub publication_removed: bool,
    pub occurred_at: i64,
    pub actor: Pubkey,
    pub bump: u8,
    pub reserved: [u8; 15],
}

impl CommitmentEvent {
    pub const SEED_PREFIX: &'static [u8] = b"event";
    pub const LEN: usize = 332;
}

pub fn valid_category(value: u8) -> bool {
    value <= CATEGORY_OTHER_PUBLIC_INFRASTRUCTURE
}

pub fn valid_lifecycle(value: u8) -> bool {
    value <= LIFECYCLE_DISPUTED
}

pub fn valid_role_bits(value: u16) -> bool {
    value != 0 && value & !ROLE_ALL == 0
}

pub fn valid_lifecycle_transition(from: u8, to: u8) -> bool {
    match from {
        LIFECYCLE_OPEN => matches!(
            to,
            LIFECYCLE_IN_PROGRESS | LIFECYCLE_DISPUTED | LIFECYCLE_CLOSED
        ),
        LIFECYCLE_IN_PROGRESS => matches!(
            to,
            LIFECYCLE_RESOLVED | LIFECYCLE_DISPUTED | LIFECYCLE_CLOSED
        ),
        LIFECYCLE_RESOLVED => matches!(to, LIFECYCLE_DISPUTED | LIFECYCLE_CLOSED),
        LIFECYCLE_DISPUTED => matches!(
            to,
            LIFECYCLE_OPEN | LIFECYCLE_IN_PROGRESS | LIFECYCLE_RESOLVED | LIFECYCLE_CLOSED
        ),
        LIFECYCLE_CLOSED => false,
        _ => false,
    }
}

pub fn nonzero_hash(value: &[u8; 32]) -> bool {
    *value != [0; 32]
}

#[cfg(test)]
mod tests {
    use super::*;
    use anchor_lang::AnchorSerialize;

    #[test]
    fn fixed_layout_lengths_match_the_contract() {
        let protocol = ProtocolConfig {
            version: PROTOCOL_VERSION,
            authority: GENESIS_AUTHORITY,
            pending_authority: Some(GENESIS_AUTHORITY),
            paused: true,
            revision: 1,
            bump: 255,
            reserved: [0; 56],
        };
        let grant = RoleGrant {
            protocol: GENESIS_AUTHORITY,
            subject: GENESIS_AUTHORITY,
            role_bits: ROLE_ALL,
            active: true,
            granted_at: 1,
            revoked_at: 0,
            revision: 1,
            bump: 255,
            reserved: [0; 24],
        };
        let issue = IssueCommitment {
            protocol: GENESIS_AUTHORITY,
            issue_key: [1; 32],
            issuer: GENESIS_AUTHORITY,
            category: CATEGORY_WATER,
            lifecycle: LIFECYCLE_OPEN,
            publication_removed: false,
            metadata_hash: [2; 32],
            evidence_hash: [3; 32],
            location_hash: [4; 32],
            timeline_head: [5; 32],
            handoff_head: [0; 32],
            update_count: 1,
            created_at: 1,
            updated_at: 1,
            bump: 255,
            reserved: [0; 32],
        };
        let event = CommitmentEvent {
            issue: GENESIS_AUTHORITY,
            event_id: [1; 32],
            event_type: EVENT_ISSUE_CREATED,
            category: CATEGORY_WATER,
            sequence: 1,
            previous_head: [0; 32],
            new_head: [2; 32],
            payload_hash: [3; 32],
            metadata_hash: [4; 32],
            issue_evidence_hash: [5; 32],
            location_hash: [6; 32],
            lifecycle: LIFECYCLE_OPEN,
            publication_removed: false,
            occurred_at: 1,
            actor: GENESIS_AUTHORITY,
            bump: 255,
            reserved: [0; 15],
        };

        assert_eq!(
            8 + protocol.try_to_vec().unwrap().len(),
            ProtocolConfig::LEN
        );
        assert_eq!(8 + grant.try_to_vec().unwrap().len(), RoleGrant::LEN);
        assert_eq!(8 + issue.try_to_vec().unwrap().len(), IssueCommitment::LEN);
        assert_eq!(8 + event.try_to_vec().unwrap().len(), CommitmentEvent::LEN);
    }

    #[test]
    fn enums_roles_and_terminal_edges_are_closed() {
        assert!(valid_category(CATEGORY_OTHER_PUBLIC_INFRASTRUCTURE));
        assert!(!valid_category(CATEGORY_OTHER_PUBLIC_INFRASTRUCTURE + 1));
        assert!(valid_role_bits(ROLE_ALL));
        assert!(!valid_role_bits(0));
        assert!(!valid_role_bits(ROLE_ALL | 0x0010));
        assert!(valid_lifecycle_transition(
            LIFECYCLE_IN_PROGRESS,
            LIFECYCLE_RESOLVED
        ));
        assert!(valid_lifecycle_transition(
            LIFECYCLE_DISPUTED,
            LIFECYCLE_OPEN
        ));
        assert!(!valid_lifecycle_transition(
            LIFECYCLE_CLOSED,
            LIFECYCLE_OPEN
        ));
        assert!(!valid_lifecycle_transition(LIFECYCLE_OPEN, LIFECYCLE_OPEN));
    }

    #[test]
    fn genesis_authority_is_fixed_and_non_default() {
        assert_ne!(GENESIS_AUTHORITY, Pubkey::default());
        assert_eq!(
            GENESIS_AUTHORITY.to_string(),
            "94GGj4zzhRQV5FzpL3RmYoZrH5qoLhdRMKYj9t9ndv5i"
        );
    }
}
