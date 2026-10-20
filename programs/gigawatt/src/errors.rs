use anchor_lang::prelude::*;

#[error_code]
pub enum GigawattError {
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("Fee in bps is out of range")]
    InvalidBps,
    #[msg("Arithmetic overflow")]
    Overflow,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Flush interval has not elapsed")]
    FlushTooSoon,
    #[msg("USDC received is below min_flush_usdc")]
    FlushTooSmall,
    #[msg("Flush amounts are inconsistent")]
    InvalidFlushAmounts,
    #[msg("Invalid merkle proof")]
    InvalidProof,
    #[msg("Rewards vault balance is insufficient")]
    InsufficientVault,
    #[msg("Invalid ask price")]
    InvalidPrice,
    #[msg("Fill amount exceeds remaining")]
    FillExceedsRemaining,
    #[msg("Order cost rounds to zero")]
    CostTooSmall,
    #[msg("Account address does not match config")]
    AddressMismatch,
}
