use anchor_lang::prelude::*;

#[error_code]
pub enum NagarikSignalError {
    #[msg("Invalid category.")]
    InvalidCategory,
    #[msg("Invalid status.")]
    InvalidStatus,
    #[msg("Hash value must be non-zero.")]
    InvalidHash,
    #[msg("First observed date is outside the accepted MVP range.")]
    InvalidObservedDate,
    #[msg("Only an active steward can perform this action.")]
    UnauthorizedSteward,
    #[msg("Steward is inactive.")]
    StewardInactive,
    #[msg("Duplicate verification is not allowed.")]
    DuplicateVerification,
    #[msg("Reporter cannot verify their own issue.")]
    SelfVerificationNotAllowed,
    #[msg("Issue is closed.")]
    IssueClosed,
    #[msg("Invalid status update sequence.")]
    InvalidSequence,
    #[msg("Resolution proof is required for resolved status.")]
    ResolutionProofRequired,
    #[msg("Arithmetic overflow.")]
    ArithmeticOverflow,
}
