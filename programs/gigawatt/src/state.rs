use anchor_lang::prelude::*;

pub const CONFIG_SEED: &[u8] = b"config";
pub const WATT_MINT_SEED: &[u8] = b"watt_mint";
pub const FLUSH_SEED: &[u8] = b"flush";
pub const CLAIM_SEED: &[u8] = b"claim";
pub const ASK_SEED: &[u8] = b"ask";

pub const BPS_DENOMINATOR: u64 = 10_000;
pub const MAX_FEE_BPS: u16 = 5_000;
/// 1 WATT = 1e6 atoms. Ask prices are USDC atoms per 1 WATT.
pub const WATT_UNIT: u128 = 1_000_000;

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub admin: Pubkey,
    pub keeper: Pubkey,
    pub gwatt_mint: Pubkey,
    pub watt_mint: Pubkey,
    pub usdc_mint: Pubkey,
    /// Owner of the treasury USDC / WATT ATAs.
    pub treasury: Pubkey,
    /// Owner of the funding USDC ATA (1:1 backing of WATT).
    pub funding_wallet: Pubkey,
    pub purchase_fee_bps: u16,
    pub activation_fee_bps: u16,
    pub buyer_fee_bps: u16,
    pub treasury_share_bps: u16,
    pub flush_interval: i64,
    pub min_flush_usdc: u64,
    pub last_flush_ts: i64,
    pub flush_count: u64,
    /// WATT minted (purchases + rewards).
    pub total_minted: u64,
    /// WATT burned through activation.
    pub total_burned: u64,
    /// WATT minted to the rewards vault for GWATT holders.
    pub total_rewards: u64,
    /// WATT claimed out of the rewards vault.
    pub total_claimed: u64,
    /// USDC that entered the funding wallet (purchases net of fee + flush share).
    pub total_usdc_in: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Flush {
    pub index: u64,
    pub ts: i64,
    pub slot: u64,
    pub sol_collected: u64,
    pub usdc_received: u64,
    pub usdc_to_treasury: u64,
    pub usdc_to_funding: u64,
    pub watt_for_holders: u64,
    pub merkle_root: [u8; 32],
    pub holder_supply: u64,
    pub holder_count: u32,
    pub claimed: u64,
}

#[account]
#[derive(InitSpace)]
pub struct ClaimStatus {
    pub flush: Pubkey,
    pub claimant: Pubkey,
    pub amount: u64,
    pub ts: i64,
}

#[account]
#[derive(InitSpace)]
pub struct Ask {
    pub seller: Pubkey,
    pub nonce: u64,
    /// USDC atoms per 1 WATT (1e6 atoms).
    pub price: u64,
    pub amount: u64,
    pub remaining: u64,
    pub ts: i64,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct InitParams {
    pub keeper: Pubkey,
    pub treasury: Pubkey,
    pub funding_wallet: Pubkey,
    pub purchase_fee_bps: u16,
    pub activation_fee_bps: u16,
    pub buyer_fee_bps: u16,
    pub treasury_share_bps: u16,
    pub flush_interval: i64,
    pub min_flush_usdc: u64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, Default)]
pub struct ParamsUpdate {
    pub treasury: Option<Pubkey>,
    pub funding_wallet: Option<Pubkey>,
    pub purchase_fee_bps: Option<u16>,
    pub activation_fee_bps: Option<u16>,
    pub buyer_fee_bps: Option<u16>,
    pub treasury_share_bps: Option<u16>,
    pub flush_interval: Option<i64>,
    pub min_flush_usdc: Option<u64>,
}
