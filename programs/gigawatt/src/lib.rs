//! Gigawatt — "Hold the token. Own the compute."
//!
//! WATT is a 6-decimal SPL credit token backed 1:1 by USDC held in a funding wallet.
//! GWATT holders receive WATT rewards through keeper-driven flushes with Merkle claims.
//! An on-chain ask book lets holders sell WATT for USDC.

use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Burn, Mint, MintTo, Token, TokenAccount, Transfer};

pub mod errors;
pub mod events;
pub mod merkle;
pub mod state;

use errors::GigawattError;
use events::*;
use state::*;

declare_id!("DMJhUAYNidpugX2HRFrevjCoiM5fM6uczxWsMQ1G3m4n");

// ---------------------------------------------------------------------------
// Math helpers
// ---------------------------------------------------------------------------

fn bps_of(amount: u64, bps: u16) -> Result<u64> {
    let v = (amount as u128)
        .checked_mul(bps as u128)
        .ok_or(GigawattError::Overflow)?
        / (BPS_DENOMINATOR as u128);
    u64::try_from(v).map_err(|_| error!(GigawattError::Overflow))
}

fn check_bps(bps: u16) -> Result<()> {
    require!(bps <= MAX_FEE_BPS, GigawattError::InvalidBps);
    Ok(())
}

/// Burn `amount` WATT from `from`, minus `activation_fee_bps` which goes to the treasury WATT ATA.
/// Returns (fee, net). `authority` must own `from`, or be the config PDA when `signer_seeds` is provided.
#[allow(clippy::too_many_arguments)]
fn activate_inner<'info>(
    config: &mut Account<'info, Config>,
    watt_mint: &Account<'info, Mint>,
    from: &Account<'info, TokenAccount>,
    treasury_watt: &Account<'info, TokenAccount>,
    authority: AccountInfo<'info>,
    token_program: &Program<'info, Token>,
    signer_seeds: Option<&[&[&[u8]]]>,
    amount: u64,
) -> Result<(u64, u64)> {
    require!(amount > 0, GigawattError::ZeroAmount);
    let fee = bps_of(amount, config.activation_fee_bps)?;
    let net = amount.checked_sub(fee).ok_or(GigawattError::Overflow)?;
    require!(net > 0, GigawattError::ZeroAmount);

    if fee > 0 {
        let cpi = CpiContext::new(
            token_program.to_account_info(),
            Transfer {
                from: from.to_account_info(),
                to: treasury_watt.to_account_info(),
                authority: authority.clone(),
            },
        );
        match signer_seeds {
            Some(seeds) => token::transfer(cpi.with_signer(seeds), fee)?,
            None => token::transfer(cpi, fee)?,
        }
    }

    let cpi = CpiContext::new(
        token_program.to_account_info(),
        Burn {
            mint: watt_mint.to_account_info(),
            from: from.to_account_info(),
            authority,
        },
    );
    match signer_seeds {
        Some(seeds) => token::burn(cpi.with_signer(seeds), net)?,
        None => token::burn(cpi, net)?,
    }

    config.total_burned = config
        .total_burned
        .checked_add(net)
        .ok_or(GigawattError::Overflow)?;
    Ok((fee, net))
}

// ---------------------------------------------------------------------------
// Program
// ---------------------------------------------------------------------------

#[program]
pub mod gigawatt {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, params: InitParams) -> Result<()> {
        check_bps(params.purchase_fee_bps)?;
        check_bps(params.activation_fee_bps)?;
        check_bps(params.buyer_fee_bps)?;
        require!(
            params.treasury_share_bps as u64 <= BPS_DENOMINATOR,
            GigawattError::InvalidBps
        );
        require!(params.flush_interval >= 0, GigawattError::InvalidFlushAmounts);

        let config = &mut ctx.accounts.config;
        config.admin = ctx.accounts.admin.key();
        config.keeper = params.keeper;
        config.gwatt_mint = ctx.accounts.gwatt_mint.key();
        config.watt_mint = ctx.accounts.watt_mint.key();
        config.usdc_mint = ctx.accounts.usdc_mint.key();
        config.treasury = params.treasury;
        config.funding_wallet = params.funding_wallet;
        config.purchase_fee_bps = params.purchase_fee_bps;
        config.activation_fee_bps = params.activation_fee_bps;
        config.buyer_fee_bps = params.buyer_fee_bps;
        config.treasury_share_bps = params.treasury_share_bps;
        config.flush_interval = params.flush_interval;
        config.min_flush_usdc = params.min_flush_usdc;
        config.last_flush_ts = 0;
        config.flush_count = 0;
        config.total_minted = 0;
        config.total_burned = 0;
        config.total_rewards = 0;
        config.total_claimed = 0;
        config.total_usdc_in = 0;
        config.bump = ctx.bumps.config;
        Ok(())
    }

    pub fn set_params(ctx: Context<AdminOnly>, params: ParamsUpdate) -> Result<()> {
        let config = &mut ctx.accounts.config;
        if let Some(v) = params.treasury {
            config.treasury = v;
        }
        if let Some(v) = params.funding_wallet {
            config.funding_wallet = v;
        }
        if let Some(v) = params.purchase_fee_bps {
            check_bps(v)?;
            config.purchase_fee_bps = v;
        }
        if let Some(v) = params.activation_fee_bps {
            check_bps(v)?;
            config.activation_fee_bps = v;
        }
        if let Some(v) = params.buyer_fee_bps {
            check_bps(v)?;
            config.buyer_fee_bps = v;
        }
        if let Some(v) = params.treasury_share_bps {
            require!(v as u64 <= BPS_DENOMINATOR, GigawattError::InvalidBps);
            config.treasury_share_bps = v;
        }
        if let Some(v) = params.flush_interval {
            require!(v >= 0, GigawattError::InvalidFlushAmounts);
            config.flush_interval = v;
        }
        if let Some(v) = params.min_flush_usdc {
            config.min_flush_usdc = v;
        }
        Ok(())
    }

    pub fn set_keeper(ctx: Context<AdminOnly>, keeper: Pubkey) -> Result<()> {
        ctx.accounts.config.keeper = keeper;
        Ok(())
    }

    /// User pays `usdc_amount` USDC: fee → treasury, rest → funding wallet; mints (usdc_amount − fee) WATT.
    pub fn buy_watt(ctx: Context<BuyWatt>, usdc_amount: u64) -> Result<()> {
        require!(usdc_amount > 0, GigawattError::ZeroAmount);
        let config = &ctx.accounts.config;
        let fee = bps_of(usdc_amount, config.purchase_fee_bps)?;
        let net = usdc_amount.checked_sub(fee).ok_or(GigawattError::Overflow)?;
        require!(net > 0, GigawattError::ZeroAmount);

        if fee > 0 {
            token::transfer(
                CpiContext::new(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.buyer_usdc.to_account_info(),
                        to: ctx.accounts.treasury_usdc.to_account_info(),
                        authority: ctx.accounts.buyer.to_account_info(),
                    },
                ),
                fee,
            )?;
        }
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.buyer_usdc.to_account_info(),
                    to: ctx.accounts.funding_usdc.to_account_info(),
                    authority: ctx.accounts.buyer.to_account_info(),
                },
            ),
            net,
        )?;

        let bump = config.bump;
        let seeds: &[&[&[u8]]] = &[&[CONFIG_SEED, &[bump]]];
        token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                MintTo {
                    mint: ctx.accounts.watt_mint.to_account_info(),
                    to: ctx.accounts.buyer_watt.to_account_info(),
                    authority: ctx.accounts.config.to_account_info(),
                },
                seeds,
            ),
            net,
        )?;

        let config = &mut ctx.accounts.config;
        config.total_minted = config
            .total_minted
            .checked_add(net)
            .ok_or(GigawattError::Overflow)?;
        config.total_usdc_in = config
            .total_usdc_in
            .checked_add(net)
            .ok_or(GigawattError::Overflow)?;

        emit!(Bought {
            buyer: ctx.accounts.buyer.key(),
            usdc_amount,
            fee,
            watt_minted: net,
            ts: Clock::get()?.unix_timestamp,
        });
        Ok(())
    }

    /// Burns `amount` WATT (minus activation fee sent to treasury_watt). Off-chain credit = net / 1e6 $.
    pub fn activate(ctx: Context<Activate>, amount: u64) -> Result<()> {
        let (_fee, net) = activate_inner(
            &mut ctx.accounts.config,
            &ctx.accounts.watt_mint,
            &ctx.accounts.owner_watt,
            &ctx.accounts.treasury_watt,
            ctx.accounts.owner.to_account_info(),
            &ctx.accounts.token_program,
            None,
            amount,
        )?;
        emit!(Activated {
            owner: ctx.accounts.owner.key(),
            amount,
            net,
            ts: Clock::get()?.unix_timestamp,
        });
        Ok(())
    }

    /// Keeper records a rewards flush: mints `watt_for_holders` to the rewards vault and stores the Merkle root.
    #[allow(clippy::too_many_arguments)]
    pub fn flush(
        ctx: Context<FlushCtx>,
        sol_collected: u64,
        usdc_received: u64,
        usdc_to_treasury: u64,
        watt_for_holders: u64,
        merkle_root: [u8; 32],
        holder_supply: u64,
        holder_count: u32,
    ) -> Result<()> {
        let clock = Clock::get()?;
        let config = &mut ctx.accounts.config;

        // Interval check (skipped for the very first flush).
        if config.flush_count > 0 {
            let due = config
                .last_flush_ts
                .checked_add(config.flush_interval)
                .ok_or(GigawattError::Overflow)?;
            require!(clock.unix_timestamp >= due, GigawattError::FlushTooSoon);
        }
        require!(usdc_received >= config.min_flush_usdc, GigawattError::FlushTooSmall);
        require!(usdc_to_treasury <= usdc_received, GigawattError::InvalidFlushAmounts);
        let usdc_to_funding = usdc_received
            .checked_sub(usdc_to_treasury)
            .ok_or(GigawattError::Overflow)?;
        // WATT is 1:1 with USDC in the funding wallet: never mint more than what was funded.
        require!(watt_for_holders <= usdc_to_funding, GigawattError::InvalidFlushAmounts);
        if watt_for_holders > 0 {
            require!(holder_supply > 0 && holder_count > 0, GigawattError::InvalidFlushAmounts);
        }

        let index = config.flush_count;

        if watt_for_holders > 0 {
            let bump = config.bump;
            let seeds: &[&[&[u8]]] = &[&[CONFIG_SEED, &[bump]]];
            token::mint_to(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    MintTo {
                        mint: ctx.accounts.watt_mint.to_account_info(),
                        to: ctx.accounts.rewards_vault.to_account_info(),
                        authority: config.to_account_info(),
                    },
                    seeds,
                ),
                watt_for_holders,
            )?;
        }

        let f = &mut ctx.accounts.flush;
        f.index = index;
        f.ts = clock.unix_timestamp;
        f.slot = clock.slot;
        f.sol_collected = sol_collected;
        f.usdc_received = usdc_received;
        f.usdc_to_treasury = usdc_to_treasury;
        f.usdc_to_funding = usdc_to_funding;
        f.watt_for_holders = watt_for_holders;
        f.merkle_root = merkle_root;
        f.holder_supply = holder_supply;
        f.holder_count = holder_count;
        f.claimed = 0;

        config.flush_count = index.checked_add(1).ok_or(GigawattError::Overflow)?;
        config.last_flush_ts = clock.unix_timestamp;
        config.total_minted = config
            .total_minted
            .checked_add(watt_for_holders)
            .ok_or(GigawattError::Overflow)?;
        config.total_rewards = config
            .total_rewards
            .checked_add(watt_for_holders)
            .ok_or(GigawattError::Overflow)?;
        config.total_usdc_in = config
            .total_usdc_in
            .checked_add(usdc_to_funding)
            .ok_or(GigawattError::Overflow)?;

        emit!(Flushed {
            index,
            ts: clock.unix_timestamp,
            slot: clock.slot,
            sol_collected,
            usdc_received,
            usdc_to_treasury,
            usdc_to_funding,
            watt_for_holders,
            merkle_root,
            holder_supply,
            holder_count,
        });
        Ok(())
    }

    /// Claim rewards for `flush_index` into the claimant's WATT ATA.
    pub fn claim(
        ctx: Context<Claim>,
        flush_index: u64,
        amount: u64,
        proof: Vec<[u8; 32]>,
    ) -> Result<()> {
        require!(amount > 0, GigawattError::ZeroAmount);
        let claimant = ctx.accounts.claimant.key();
        require!(
            merkle::verify(&ctx.accounts.flush.merkle_root, &claimant, amount, &proof),
            GigawattError::InvalidProof
        );
        require!(
            ctx.accounts.rewards_vault.amount >= amount,
            GigawattError::InsufficientVault
        );

        let clock = Clock::get()?;
        let bump = ctx.accounts.config.bump;
        let seeds: &[&[&[u8]]] = &[&[CONFIG_SEED, &[bump]]];
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.rewards_vault.to_account_info(),
                    to: ctx.accounts.claimant_watt.to_account_info(),
                    authority: ctx.accounts.config.to_account_info(),
                },
                seeds,
            ),
            amount,
        )?;

        record_claim(
            &mut ctx.accounts.config,
            &mut ctx.accounts.flush,
            &mut ctx.accounts.claim_status,
            claimant,
            amount,
            clock.unix_timestamp,
        )?;

        emit!(Claimed {
            flush_index,
            claimant,
            amount,
            activated: false,
            ts: clock.unix_timestamp,
        });
        Ok(())
    }

    /// Claim rewards and activate them in one step: fee → treasury_watt, net burned straight from the vault.
    pub fn claim_and_activate(
        ctx: Context<ClaimAndActivate>,
        flush_index: u64,
        amount: u64,
        proof: Vec<[u8; 32]>,
    ) -> Result<()> {
        require!(amount > 0, GigawattError::ZeroAmount);
        let claimant = ctx.accounts.claimant.key();
        require!(
            merkle::verify(&ctx.accounts.flush.merkle_root, &claimant, amount, &proof),
            GigawattError::InvalidProof
        );
        require!(
            ctx.accounts.rewards_vault.amount >= amount,
            GigawattError::InsufficientVault
        );

        let clock = Clock::get()?;
        let bump = ctx.accounts.config.bump;
        let seeds: &[&[&[u8]]] = &[&[CONFIG_SEED, &[bump]]];
        let config_info = ctx.accounts.config.to_account_info();
        let (_fee, net) = activate_inner(
            &mut ctx.accounts.config,
            &ctx.accounts.watt_mint,
            &ctx.accounts.rewards_vault,
            &ctx.accounts.treasury_watt,
            config_info,
            &ctx.accounts.token_program,
            Some(seeds),
            amount,
        )?;

        record_claim(
            &mut ctx.accounts.config,
            &mut ctx.accounts.flush,
            &mut ctx.accounts.claim_status,
            claimant,
            amount,
            clock.unix_timestamp,
        )?;

        emit!(Claimed {
            flush_index,
            claimant,
            amount,
            activated: true,
            ts: clock.unix_timestamp,
        });
        emit!(Activated {
            owner: claimant,
            amount,
            net,
            ts: clock.unix_timestamp,
        });
        Ok(())
    }

    /// Escrow `amount` WATT at `price` (USDC atoms per 1 WATT).
    pub fn place_ask(ctx: Context<PlaceAsk>, nonce: u64, price: u64, amount: u64) -> Result<()> {
        require!(amount > 0, GigawattError::ZeroAmount);
        require!(price > 0, GigawattError::InvalidPrice);

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.seller_watt.to_account_info(),
                    to: ctx.accounts.ask_escrow.to_account_info(),
                    authority: ctx.accounts.seller.to_account_info(),
                },
            ),
            amount,
        )?;

        let clock = Clock::get()?;
        let ask = &mut ctx.accounts.ask;
        ask.seller = ctx.accounts.seller.key();
        ask.nonce = nonce;
        ask.price = price;
        ask.amount = amount;
        ask.remaining = amount;
        ask.ts = clock.unix_timestamp;
        ask.bump = ctx.bumps.ask;

        emit!(AskPlaced {
            ask: ask.key(),
            seller: ask.seller,
            nonce,
            price,
            amount,
            ts: clock.unix_timestamp,
        });
        Ok(())
    }

    /// Return remaining escrow to the seller and close the ask.
    pub fn cancel_ask(ctx: Context<CancelAsk>) -> Result<()> {
        let ask = &ctx.accounts.ask;
        let returned = ctx.accounts.ask_escrow.amount;
        let seller = ask.seller;
        let nonce_le = ask.nonce.to_le_bytes();
        let seeds: &[&[&[u8]]] = &[&[ASK_SEED, seller.as_ref(), &nonce_le, &[ask.bump]]];

        if returned > 0 {
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.ask_escrow.to_account_info(),
                        to: ctx.accounts.seller_watt.to_account_info(),
                        authority: ask.to_account_info(),
                    },
                    seeds,
                ),
                returned,
            )?;
        }
        token::close_account(CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            token::CloseAccount {
                account: ctx.accounts.ask_escrow.to_account_info(),
                destination: ctx.accounts.seller.to_account_info(),
                authority: ask.to_account_info(),
            },
            seeds,
        ))?;

        emit!(AskCancelled {
            ask: ask.key(),
            seller,
            returned,
            ts: Clock::get()?.unix_timestamp,
        });
        Ok(())
    }

    /// Buyer pays price × amount USDC to the seller plus `buyer_fee_bps` to the treasury, receives WATT.
    pub fn fill_ask(ctx: Context<FillAsk>, amount: u64) -> Result<()> {
        require!(amount > 0, GigawattError::ZeroAmount);
        let ask = &ctx.accounts.ask;
        require!(amount <= ask.remaining, GigawattError::FillExceedsRemaining);

        // cost = price * amount / 1e6 (price is USDC atoms per whole WATT)
        let cost_u128 = (ask.price as u128)
            .checked_mul(amount as u128)
            .ok_or(GigawattError::Overflow)?
            / WATT_UNIT;
        let cost = u64::try_from(cost_u128).map_err(|_| error!(GigawattError::Overflow))?;
        require!(cost > 0, GigawattError::CostTooSmall);
        let fee = bps_of(cost, ctx.accounts.config.buyer_fee_bps)?;

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.buyer_usdc.to_account_info(),
                    to: ctx.accounts.seller_usdc.to_account_info(),
                    authority: ctx.accounts.buyer.to_account_info(),
                },
            ),
            cost,
        )?;
        if fee > 0 {
            token::transfer(
                CpiContext::new(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.buyer_usdc.to_account_info(),
                        to: ctx.accounts.treasury_usdc.to_account_info(),
                        authority: ctx.accounts.buyer.to_account_info(),
                    },
                ),
                fee,
            )?;
        }

        let seller = ask.seller;
        let nonce_le = ask.nonce.to_le_bytes();
        let seeds: &[&[&[u8]]] = &[&[ASK_SEED, seller.as_ref(), &nonce_le, &[ask.bump]]];
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.ask_escrow.to_account_info(),
                    to: ctx.accounts.buyer_watt.to_account_info(),
                    authority: ask.to_account_info(),
                },
                seeds,
            ),
            amount,
        )?;

        let ask = &mut ctx.accounts.ask;
        ask.remaining = ask.remaining.checked_sub(amount).ok_or(GigawattError::Overflow)?;
        let remaining = ask.remaining;
        let ask_key = ask.key();
        let price = ask.price;

        if remaining == 0 {
            // Close escrow + ask account, rent back to the seller.
            token::close_account(CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                token::CloseAccount {
                    account: ctx.accounts.ask_escrow.to_account_info(),
                    destination: ctx.accounts.seller_account.to_account_info(),
                    authority: ask.to_account_info(),
                },
                seeds,
            ))?;
            ask.close(ctx.accounts.seller_account.to_account_info())?;
        }

        emit!(Filled {
            ask: ask_key,
            seller,
            buyer: ctx.accounts.buyer.key(),
            amount,
            price,
            cost,
            fee,
            remaining,
            ts: Clock::get()?.unix_timestamp,
        });
        Ok(())
    }
}

fn record_claim(
    config: &mut Account<Config>,
    flush: &mut Account<Flush>,
    status: &mut Account<ClaimStatus>,
    claimant: Pubkey,
    amount: u64,
    ts: i64,
) -> Result<()> {
    status.flush = flush.key();
    status.claimant = claimant;
    status.amount = amount;
    status.ts = ts;
    flush.claimed = flush.claimed.checked_add(amount).ok_or(GigawattError::Overflow)?;
    config.total_claimed = config
        .total_claimed
        .checked_add(amount)
        .ok_or(GigawattError::Overflow)?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(
        init,
        payer = admin,
        space = 8 + Config::INIT_SPACE,
        seeds = [CONFIG_SEED],
        bump,
    )]
    pub config: Account<'info, Config>,
    pub gwatt_mint: Account<'info, Mint>,
    pub usdc_mint: Account<'info, Mint>,
    /// WATT mint: PDA so the address is deterministic; authority = config PDA.
    #[account(
        init,
        payer = admin,
        seeds = [WATT_MINT_SEED],
        bump,
        mint::decimals = 6,
        mint::authority = config,
    )]
    pub watt_mint: Account<'info, Mint>,
    #[account(
        init,
        payer = admin,
        associated_token::mint = watt_mint,
        associated_token::authority = config,
    )]
    pub rewards_vault: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct AdminOnly<'info> {
    pub admin: Signer<'info>,
    #[account(mut, seeds = [CONFIG_SEED], bump = config.bump, has_one = admin @ GigawattError::Unauthorized)]
    pub config: Account<'info, Config>,
}

#[derive(Accounts)]
pub struct BuyWatt<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,
    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = watt_mint @ GigawattError::AddressMismatch,
        has_one = usdc_mint @ GigawattError::AddressMismatch,
    )]
    pub config: Box<Account<'info, Config>>,
    #[account(mut)]
    pub watt_mint: Box<Account<'info, Mint>>,
    pub usdc_mint: Box<Account<'info, Mint>>,
    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = buyer,
    )]
    pub buyer_usdc: Box<Account<'info, TokenAccount>>,
    #[account(
        init_if_needed,
        payer = buyer,
        associated_token::mint = watt_mint,
        associated_token::authority = buyer,
    )]
    pub buyer_watt: Box<Account<'info, TokenAccount>>,
    /// CHECK: owner of the treasury USDC ATA, validated against config.
    #[account(address = config.treasury @ GigawattError::AddressMismatch)]
    pub treasury: UncheckedAccount<'info>,
    #[account(
        init_if_needed,
        payer = buyer,
        associated_token::mint = usdc_mint,
        associated_token::authority = treasury,
    )]
    pub treasury_usdc: Box<Account<'info, TokenAccount>>,
    /// CHECK: owner of the funding USDC ATA, validated against config.
    #[account(address = config.funding_wallet @ GigawattError::AddressMismatch)]
    pub funding_wallet: UncheckedAccount<'info>,
    #[account(
        init_if_needed,
        payer = buyer,
        associated_token::mint = usdc_mint,
        associated_token::authority = funding_wallet,
    )]
    pub funding_usdc: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Activate<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = watt_mint @ GigawattError::AddressMismatch,
    )]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub watt_mint: Account<'info, Mint>,
    #[account(
        mut,
        associated_token::mint = watt_mint,
        associated_token::authority = owner,
    )]
    pub owner_watt: Account<'info, TokenAccount>,
    /// CHECK: validated against config.
    #[account(address = config.treasury @ GigawattError::AddressMismatch)]
    pub treasury: UncheckedAccount<'info>,
    #[account(
        init_if_needed,
        payer = owner,
        associated_token::mint = watt_mint,
        associated_token::authority = treasury,
    )]
    pub treasury_watt: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct FlushCtx<'info> {
    #[account(mut)]
    pub keeper: Signer<'info>,
    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = keeper @ GigawattError::Unauthorized,
        has_one = watt_mint @ GigawattError::AddressMismatch,
    )]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub watt_mint: Account<'info, Mint>,
    #[account(
        mut,
        associated_token::mint = watt_mint,
        associated_token::authority = config,
    )]
    pub rewards_vault: Account<'info, TokenAccount>,
    #[account(
        init,
        payer = keeper,
        space = 8 + Flush::INIT_SPACE,
        seeds = [FLUSH_SEED, config.key().as_ref(), &config.flush_count.to_le_bytes()],
        bump,
    )]
    pub flush: Account<'info, Flush>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(flush_index: u64)]
pub struct Claim<'info> {
    #[account(mut)]
    pub claimant: Signer<'info>,
    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = watt_mint @ GigawattError::AddressMismatch,
    )]
    pub config: Box<Account<'info, Config>>,
    pub watt_mint: Box<Account<'info, Mint>>,
    #[account(
        mut,
        seeds = [FLUSH_SEED, config.key().as_ref(), &flush_index.to_le_bytes()],
        bump,
    )]
    pub flush: Box<Account<'info, Flush>>,
    /// Double-claim prevention: `init` fails if this PDA already exists.
    #[account(
        init,
        payer = claimant,
        space = 8 + ClaimStatus::INIT_SPACE,
        seeds = [CLAIM_SEED, flush.key().as_ref(), claimant.key().as_ref()],
        bump,
    )]
    pub claim_status: Box<Account<'info, ClaimStatus>>,
    #[account(
        mut,
        associated_token::mint = watt_mint,
        associated_token::authority = config,
    )]
    pub rewards_vault: Box<Account<'info, TokenAccount>>,
    #[account(
        init_if_needed,
        payer = claimant,
        associated_token::mint = watt_mint,
        associated_token::authority = claimant,
    )]
    pub claimant_watt: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(flush_index: u64)]
pub struct ClaimAndActivate<'info> {
    #[account(mut)]
    pub claimant: Signer<'info>,
    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = watt_mint @ GigawattError::AddressMismatch,
    )]
    pub config: Box<Account<'info, Config>>,
    #[account(mut)]
    pub watt_mint: Box<Account<'info, Mint>>,
    #[account(
        mut,
        seeds = [FLUSH_SEED, config.key().as_ref(), &flush_index.to_le_bytes()],
        bump,
    )]
    pub flush: Box<Account<'info, Flush>>,
    #[account(
        init,
        payer = claimant,
        space = 8 + ClaimStatus::INIT_SPACE,
        seeds = [CLAIM_SEED, flush.key().as_ref(), claimant.key().as_ref()],
        bump,
    )]
    pub claim_status: Box<Account<'info, ClaimStatus>>,
    #[account(
        mut,
        associated_token::mint = watt_mint,
        associated_token::authority = config,
    )]
    pub rewards_vault: Box<Account<'info, TokenAccount>>,
    /// CHECK: validated against config.
    #[account(address = config.treasury @ GigawattError::AddressMismatch)]
    pub treasury: UncheckedAccount<'info>,
    #[account(
        init_if_needed,
        payer = claimant,
        associated_token::mint = watt_mint,
        associated_token::authority = treasury,
    )]
    pub treasury_watt: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(nonce: u64)]
pub struct PlaceAsk<'info> {
    #[account(mut)]
    pub seller: Signer<'info>,
    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = watt_mint @ GigawattError::AddressMismatch,
    )]
    pub config: Account<'info, Config>,
    pub watt_mint: Account<'info, Mint>,
    #[account(
        init,
        payer = seller,
        space = 8 + Ask::INIT_SPACE,
        seeds = [ASK_SEED, seller.key().as_ref(), &nonce.to_le_bytes()],
        bump,
    )]
    pub ask: Account<'info, Ask>,
    #[account(
        init,
        payer = seller,
        associated_token::mint = watt_mint,
        associated_token::authority = ask,
    )]
    pub ask_escrow: Account<'info, TokenAccount>,
    #[account(
        mut,
        associated_token::mint = watt_mint,
        associated_token::authority = seller,
    )]
    pub seller_watt: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CancelAsk<'info> {
    #[account(mut)]
    pub seller: Signer<'info>,
    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = watt_mint @ GigawattError::AddressMismatch,
    )]
    pub config: Account<'info, Config>,
    pub watt_mint: Account<'info, Mint>,
    #[account(
        mut,
        close = seller,
        seeds = [ASK_SEED, seller.key().as_ref(), &ask.nonce.to_le_bytes()],
        bump = ask.bump,
        has_one = seller @ GigawattError::Unauthorized,
    )]
    pub ask: Account<'info, Ask>,
    #[account(
        mut,
        associated_token::mint = watt_mint,
        associated_token::authority = ask,
    )]
    pub ask_escrow: Account<'info, TokenAccount>,
    #[account(
        init_if_needed,
        payer = seller,
        associated_token::mint = watt_mint,
        associated_token::authority = seller,
    )]
    pub seller_watt: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct FillAsk<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,
    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = watt_mint @ GigawattError::AddressMismatch,
        has_one = usdc_mint @ GigawattError::AddressMismatch,
    )]
    pub config: Box<Account<'info, Config>>,
    pub watt_mint: Box<Account<'info, Mint>>,
    pub usdc_mint: Box<Account<'info, Mint>>,
    #[account(
        mut,
        seeds = [ASK_SEED, ask.seller.as_ref(), &ask.nonce.to_le_bytes()],
        bump = ask.bump,
    )]
    pub ask: Box<Account<'info, Ask>>,
    #[account(
        mut,
        associated_token::mint = watt_mint,
        associated_token::authority = ask,
    )]
    pub ask_escrow: Box<Account<'info, TokenAccount>>,
    /// CHECK: the seller, validated against the ask; receives rent when the ask is fully filled.
    #[account(mut, address = ask.seller @ GigawattError::AddressMismatch)]
    pub seller_account: UncheckedAccount<'info>,
    #[account(
        init_if_needed,
        payer = buyer,
        associated_token::mint = usdc_mint,
        associated_token::authority = seller_account,
    )]
    pub seller_usdc: Box<Account<'info, TokenAccount>>,
    #[account(
        mut,
        associated_token::mint = usdc_mint,
        associated_token::authority = buyer,
    )]
    pub buyer_usdc: Box<Account<'info, TokenAccount>>,
    #[account(
        init_if_needed,
        payer = buyer,
        associated_token::mint = watt_mint,
        associated_token::authority = buyer,
    )]
    pub buyer_watt: Box<Account<'info, TokenAccount>>,
    /// CHECK: validated against config.
    #[account(address = config.treasury @ GigawattError::AddressMismatch)]
    pub treasury: UncheckedAccount<'info>,
    #[account(
        init_if_needed,
        payer = buyer,
        associated_token::mint = usdc_mint,
        associated_token::authority = treasury,
    )]
    pub treasury_usdc: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}
