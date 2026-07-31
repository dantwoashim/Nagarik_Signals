use anchor_lang::prelude::*;

#[error_code]
pub enum NagarikSignalV2Error {
    #[msg("The genesis authority does not match the compiled protocol authority.")]
    InvalidGenesisAuthority,
    #[msg("The protocol version is not supported.")]
    InvalidProtocolVersion,
    #[msg("The protocol is paused.")]
    ProtocolPaused,
    #[msg("The protocol must be paused for this operation.")]
    ProtocolMustBePaused,
    #[msg("The protocol authority is not authorized.")]
    UnauthorizedAuthority,
    #[msg("The protocol revision is stale.")]
    StaleConfigRevision,
    #[msg("The role grant revision is stale.")]
    StaleGrantRevision,
    #[msg("The authority transfer state is invalid.")]
    InvalidAuthorityTransfer,
    #[msg("The supplied authority is invalid.")]
    InvalidAuthority,
    #[msg("The requested pause state is already active.")]
    PauseStateUnchanged,
    #[msg("The role bit mask is invalid.")]
    InvalidRoleBits,
    #[msg("The role grant does not belong to this protocol and subject.")]
    InvalidRoleGrant,
    #[msg("The role change is not permitted in the current protocol state.")]
    InvalidRoleChange,
    #[msg("The role change is a no-op.")]
    RoleStateUnchanged,
    #[msg("The signer does not hold the required active role.")]
    RequiredRoleMissing,
    #[msg("The category discriminant is invalid.")]
    InvalidCategory,
    #[msg("The lifecycle discriminant is invalid.")]
    InvalidLifecycle,
    #[msg("The lifecycle transition is not allowed.")]
    InvalidLifecycleTransition,
    #[msg("A required key or hash is zero.")]
    ZeroCommitment,
    #[msg("The issue does not belong to this protocol.")]
    InvalidIssue,
    #[msg("The issue has already been removed.")]
    PublicationAlreadyRemoved,
    #[msg("The issue is terminally removed.")]
    IssueRemoved,
    #[msg("The expected issue update count is stale.")]
    StaleUpdateCount,
    #[msg("The expected issue head is stale.")]
    StaleHead,
    #[msg("The expected issue category is stale.")]
    StaleCategory,
    #[msg("The expected lifecycle is stale.")]
    StaleLifecycle,
    #[msg("The issue sequence is exhausted.")]
    SequenceExhausted,
    #[msg("Arithmetic overflow.")]
    ArithmeticOverflow,
}
