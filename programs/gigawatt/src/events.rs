use anchor_lang::prelude::*;

#[event]
pub struct Bought {
    pub buyer: Pubkey,
    pub usdc_amount: u64,
    pub fee: u64,
    pub watt_minted: u64,
    pub ts: i64,
}

#[event]
pub struct Activated {
    pub owner: Pubkey,
    pub amount: u64,
    pub net: u64,
    pub ts: i64,
}

#[event]
pub struct Flushed {
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
}

#[event]
pub struct Claimed {
    pub flush_index: u64,
    pub claimant: Pubkey,
    pub amount: u64,
    pub activated: bool,
    pub ts: i64,
}

#[event]
pub struct AskPlaced {
    pub ask: Pubkey,
    pub seller: Pubkey,
    pub nonce: u64,
    pub price: u64,
    pub amount: u64,
    pub ts: i64,
}

#[event]
pub struct AskCancelled {
    pub ask: Pubkey,
    pub seller: Pubkey,
    pub returned: u64,
    pub ts: i64,
}

#[event]
pub struct Filled {
    pub ask: Pubkey,
    pub seller: Pubkey,
    pub buyer: Pubkey,
    pub amount: u64,
    pub price: u64,
    pub cost: u64,
    pub fee: u64,
    pub remaining: u64,
    pub ts: i64,
}
