import anchor from "@coral-xyz/anchor";
import type { Program } from "@coral-xyz/anchor";
const { BN } = anchor;
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { createMint, getAccount, getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import { assert, expect } from "chai";
import {
  activate,
  ata,
  buildTree,
  buyWatt,
  cancelAsk,
  claim,
  claimAndActivate,
  computeDistribution,
  fetchAsks,
  fetchConfig,
  fetchFlush,
  fillAsk,
  findAsk,
  findClaimStatus,
  findConfig,
  findFlush,
  findWattMint,
  flush,
  initialize,
  placeAsk,
  rewardsVault,
  askEscrow,
  verify,
  type Gigawatt,
} from "../packages/sdk/src/index.ts";

const USDC = (n: number) => BigInt(Math.round(n * 1e6));
const bal = async (conn: anchor.web3.Connection, addr: PublicKey) =>
  (await conn.getAccountInfo(addr)) ? (await getAccount(conn, addr)).amount : 0n;

describe("gigawatt", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const conn = provider.connection;
  const program = anchor.workspace.gigawatt as Program<Gigawatt>;
  const admin = (provider.wallet as anchor.Wallet).payer;

  const keeper = Keypair.generate();
  const treasury = Keypair.generate();
  const funding = Keypair.generate();
  const alice = Keypair.generate(); // buyer / holder
  const bob = Keypair.generate(); // holder / ask buyer
  const carol = Keypair.generate(); // holder not claiming

  let gwattMint: PublicKey;
  let usdcMint: PublicKey;
  let wattMint: PublicKey;
  let config: PublicKey;
  const ctx = () => ({
    wattMint,
    usdcMint,
    treasury: treasury.publicKey,
    fundingWallet: funding.publicKey,
  });

  const send = (ixs: anchor.web3.TransactionInstruction[], signers: Keypair[]) =>
    provider.sendAndConfirm(new Transaction().add(...ixs), signers);

  before(async () => {
    // Fund test wallets from the provider wallet.
    const tx = new Transaction();
    for (const kp of [keeper, alice, bob, carol]) {
      tx.add(
        SystemProgram.transfer({
          fromPubkey: admin.publicKey,
          toPubkey: kp.publicKey,
          lamports: 0.5 * LAMPORTS_PER_SOL,
        }),
      );
    }
    await provider.sendAndConfirm(tx);

    gwattMint = await createMint(conn, admin, admin.publicKey, null, 6);
    usdcMint = await createMint(conn, admin, admin.publicKey, null, 6);
    [wattMint] = findWattMint(program.programId);
    [config] = findConfig(program.programId);

    // GWATT holders: alice 50%, bob 30%, carol 20%
    for (const [kp, n] of [
      [alice, 500_000],
      [bob, 300_000],
      [carol, 200_000],
    ] as [Keypair, number][]) {
      const a = await getOrCreateAssociatedTokenAccount(conn, admin, gwattMint, kp.publicKey);
      await mintTo(conn, admin, gwattMint, a.address, admin, USDC(n));
    }
    // USDC for buyers
    for (const kp of [alice, bob]) {
      const a = await getOrCreateAssociatedTokenAccount(conn, admin, usdcMint, kp.publicKey);
      await mintTo(conn, admin, usdcMint, a.address, admin, USDC(10_000));
    }
  });

  it("initialize creates config, WATT mint (authority = config) and rewards vault", async () => {
    const ix = await initialize(program, {
      admin: admin.publicKey,
      gwattMint,
      usdcMint,
      params: {
        keeper: keeper.publicKey,
        treasury: treasury.publicKey,
        fundingWallet: funding.publicKey,
        purchaseFeeBps: 500,
        activationFeeBps: 500,
        buyerFeeBps: 100,
        treasuryShareBps: 2000,
        flushInterval: 3600,
        minFlushUsdc: 0,
      },
    });
    await send([ix], []);
    const cfg = await fetchConfig(program);
    expect(cfg.admin.equals(admin.publicKey)).to.be.true;
    expect(cfg.keeper.equals(keeper.publicKey)).to.be.true;
    expect(cfg.wattMint.equals(wattMint)).to.be.true;
    expect(cfg.purchaseFeeBps).to.eq(500);
    const { getMint } = await import("@solana/spl-token");
    const m = await getMint(conn, wattMint);
    expect(m.decimals).to.eq(6);
    expect(m.mintAuthority!.equals(config)).to.be.true;
    expect(await bal(conn, rewardsVault(wattMint, program.programId))).to.eq(0n);
  });

  it("buy_watt: 5% fee to treasury, rest to funding, mints net WATT", async () => {
    const ix = await buyWatt(program, { buyer: alice.publicKey, usdcAmount: USDC(1000), ctx: ctx() });
    await send([ix], [alice]);
    expect(await bal(conn, ata(usdcMint, treasury.publicKey))).to.eq(USDC(50));
    expect(await bal(conn, ata(usdcMint, funding.publicKey))).to.eq(USDC(950));
    expect(await bal(conn, ata(wattMint, alice.publicKey))).to.eq(USDC(950));
    const cfg = await fetchConfig(program);
    expect(cfg.totalMinted.toString()).to.eq(USDC(950).toString());
    expect(cfg.totalUsdcIn.toString()).to.eq(USDC(950).toString());
  });

  it("activate: fee → treasury_watt, net burned, event emitted", async () => {
    const ix = await activate(program, { owner: alice.publicKey, amount: USDC(100), ctx: ctx() });
    const sig = await send([ix], [alice]);
    expect(await bal(conn, ata(wattMint, alice.publicKey))).to.eq(USDC(850));
    expect(await bal(conn, ata(wattMint, treasury.publicKey))).to.eq(USDC(5));
    const cfg = await fetchConfig(program);
    expect(cfg.totalBurned.toString()).to.eq(USDC(95).toString());

    const tx = await conn.getTransaction(sig, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
    const parser = new anchor.EventParser(program.programId, program.coder);
    const events = [...parser.parseLogs(tx!.meta!.logMessages!)];
    const ev = events.find((e) => e.name === "activated");
    expect(ev).to.not.be.undefined;
    expect(ev!.data.net.toString()).to.eq(USDC(95).toString());
  });

  it("activate rejects zero amount", async () => {
    const ix = await activate(program, { owner: alice.publicKey, amount: 0, ctx: ctx() });
    try {
      await send([ix], [alice]);
      assert.fail("should fail");
    } catch (e: any) {
      expect(String(e)).to.match(/ZeroAmount|6000/);
    }
  });

  describe("flush + claim", () => {
    const wattForHolders = USDC(400); // 500 USDC received, 20% to treasury → 400 to funding
    let tree: ReturnType<typeof buildTree>;
    let holderSupply: bigint;

    it("non-keeper cannot flush", async () => {
      const ix = await flush(program, {
        keeper: alice.publicKey,
        wattMint,
        flushIndex: 0,
        solCollected: 0,
        usdcReceived: 0,
        usdcToTreasury: 0,
        wattForHolders: 0,
        merkleRoot: new Uint8Array(32),
        holderSupply: 0,
        holderCount: 0,
      });
      try {
        await send([ix], [alice]);
        assert.fail("should fail");
      } catch (e: any) {
        expect(String(e)).to.match(/Unauthorized|ConstraintHasOne|2001|6003/);
      }
    });

    it("keeper flush mints WATT to the rewards vault and records the merkle root", async () => {
      const holders = [
        { owner: alice.publicKey, balance: USDC(500_000) },
        { owner: bob.publicKey, balance: USDC(300_000) },
        { owner: carol.publicKey, balance: USDC(200_000) },
      ];
      const dist = computeDistribution(holders, wattForHolders);
      holderSupply = dist.holderSupply;
      tree = buildTree(dist.leaves);

      const ix = await flush(program, {
        keeper: keeper.publicKey,
        wattMint,
        flushIndex: 0,
        solCollected: 2_000_000_000,
        usdcReceived: USDC(500),
        usdcToTreasury: USDC(100),
        wattForHolders,
        merkleRoot: tree.root,
        holderSupply,
        holderCount: 3,
      });
      await send([ix], [keeper]);

      const f = await fetchFlush(program, 0);
      expect(f!.index.toNumber()).to.eq(0);
      expect(Buffer.from(f!.merkleRoot).toString("hex")).to.eq(tree.rootHex);
      expect(f!.usdcToFunding.toString()).to.eq(USDC(400).toString());
      expect(await bal(conn, rewardsVault(wattMint, program.programId))).to.eq(wattForHolders);
      const cfg = await fetchConfig(program);
      expect(cfg.flushCount.toNumber()).to.eq(1);
      expect(cfg.totalRewards.toString()).to.eq(wattForHolders.toString());
    });

    it("second flush too soon is rejected", async () => {
      const ix = await flush(program, {
        keeper: keeper.publicKey,
        wattMint,
        flushIndex: 1,
        solCollected: 0,
        usdcReceived: USDC(1),
        usdcToTreasury: 0,
        wattForHolders: 0,
        merkleRoot: new Uint8Array(32),
        holderSupply: 0,
        holderCount: 0,
      });
      try {
        await send([ix], [keeper]);
        assert.fail("should fail");
      } catch (e: any) {
        expect(String(e)).to.match(/FlushTooSoon|6004/);
      }
    });

    it("alice claims her share (50% = 200 WATT) with a valid proof", async () => {
      const amount = tree.getAmount(alice.publicKey)!;
      expect(amount).to.eq(USDC(200));
      const proof = tree.getProof(alice.publicKey)!;
      expect(verify(tree.root, alice.publicKey, amount, proof)).to.be.true;

      const before = await bal(conn, ata(wattMint, alice.publicKey));
      const ix = await claim(program, { claimant: alice.publicKey, wattMint, flushIndex: 0, amount, proof });
      await send([ix], [alice]);
      expect(await bal(conn, ata(wattMint, alice.publicKey))).to.eq(before + amount);
      const f = await fetchFlush(program, 0);
      expect(f!.claimed.toString()).to.eq(amount.toString());
      const [fp] = findFlush(0, program.programId);
      const [cs] = findClaimStatus(fp, alice.publicKey, program.programId);
      const status = await program.account.claimStatus.fetch(cs);
      expect(status.amount.toString()).to.eq(amount.toString());
    });

    it("double claim is rejected", async () => {
      const amount = tree.getAmount(alice.publicKey)!;
      const proof = tree.getProof(alice.publicKey)!;
      const ix = await claim(program, { claimant: alice.publicKey, wattMint, flushIndex: 0, amount, proof });
      try {
        await send([ix], [alice]);
        assert.fail("should fail");
      } catch (e: any) {
        expect(String(e)).to.match(/already in use|0x0/);
      }
    });

    it("wrong amount / forged proof is rejected", async () => {
      const proof = tree.getProof(bob.publicKey)!;
      const ix = await claim(program, {
        claimant: bob.publicKey,
        wattMint,
        flushIndex: 0,
        amount: USDC(300),
        proof,
      });
      try {
        await send([ix], [bob]);
        assert.fail("should fail");
      } catch (e: any) {
        expect(String(e)).to.match(/InvalidProof|6007/);
      }
    });

    it("bob claim_and_activate: net burned straight from the vault, fee to treasury_watt", async () => {
      const amount = tree.getAmount(bob.publicKey)!; // 120 WATT
      expect(amount).to.eq(USDC(120));
      const proof = tree.getProof(bob.publicKey)!;
      const vaultBefore = await bal(conn, rewardsVault(wattMint, program.programId));
      const treasBefore = await bal(conn, ata(wattMint, treasury.publicKey));
      const ix = await claimAndActivate(program, {
        claimant: bob.publicKey,
        wattMint,
        flushIndex: 0,
        amount,
        proof,
        treasury: treasury.publicKey,
      });
      const sig = await send([ix], [bob]);
      expect(await bal(conn, rewardsVault(wattMint, program.programId))).to.eq(vaultBefore - amount);
      expect(await bal(conn, ata(wattMint, treasury.publicKey))).to.eq(treasBefore + USDC(6));
      expect(await bal(conn, ata(wattMint, bob.publicKey))).to.eq(0n);

      const tx = await conn.getTransaction(sig, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
      const parser = new anchor.EventParser(program.programId, program.coder);
      const names = [...parser.parseLogs(tx!.meta!.logMessages!)].map((e) => e.name);
      expect(names).to.include("claimed");
      expect(names).to.include("activated");
    });
  });

  describe("order book", () => {
    const nonce = 1;
    const price = USDC(0.9); // 0.9 USDC per WATT

    it("place_ask escrows WATT", async () => {
      const ix = await placeAsk(program, {
        seller: alice.publicKey,
        wattMint,
        nonce,
        price,
        amount: USDC(100),
      });
      await send([ix], [alice]);
      const [askPda] = findAsk(alice.publicKey, nonce, program.programId);
      expect(await bal(conn, askEscrow(wattMint, askPda))).to.eq(USDC(100));
      const asks = await fetchAsks(program);
      expect(asks.length).to.eq(1);
      expect(asks[0].account.remaining.toString()).to.eq(USDC(100).toString());
    });

    it("fill_ask (partial): buyer pays price×qty to seller + 1% fee to treasury", async () => {
      const sellerUsdcBefore = await bal(conn, ata(usdcMint, alice.publicKey));
      const treasBefore = await bal(conn, ata(usdcMint, treasury.publicKey));
      const ix = await fillAsk(program, {
        buyer: bob.publicKey,
        seller: alice.publicKey,
        nonce,
        amount: USDC(40),
        ctx: ctx(),
      });
      await send([ix], [bob]);
      // cost = 0.9 * 40 = 36 USDC ; fee = 0.36
      expect(await bal(conn, ata(usdcMint, alice.publicKey))).to.eq(sellerUsdcBefore + USDC(36));
      expect(await bal(conn, ata(usdcMint, treasury.publicKey))).to.eq(treasBefore + USDC(0.36));
      expect(await bal(conn, ata(wattMint, bob.publicKey))).to.eq(USDC(40));
      const asks = await fetchAsks(program);
      expect(asks[0].account.remaining.toString()).to.eq(USDC(60).toString());
    });

    it("fill exceeding remaining is rejected", async () => {
      const ix = await fillAsk(program, {
        buyer: bob.publicKey,
        seller: alice.publicKey,
        nonce,
        amount: USDC(61),
        ctx: ctx(),
      });
      try {
        await send([ix], [bob]);
        assert.fail("should fail");
      } catch (e: any) {
        expect(String(e)).to.match(/FillExceedsRemaining|6010/);
      }
    });

    it("fill_ask (full) closes the ask and escrow", async () => {
      const ix = await fillAsk(program, {
        buyer: bob.publicKey,
        seller: alice.publicKey,
        nonce,
        amount: USDC(60),
        ctx: ctx(),
      });
      await send([ix], [bob]);
      const [askPda] = findAsk(alice.publicKey, nonce, program.programId);
      expect(await conn.getAccountInfo(askPda)).to.be.null;
      expect(await conn.getAccountInfo(askEscrow(wattMint, askPda))).to.be.null;
      expect(await bal(conn, ata(wattMint, bob.publicKey))).to.eq(USDC(100));
      expect((await fetchAsks(program)).length).to.eq(0);
    });

    it("cancel_ask returns escrow to the seller", async () => {
      const before = await bal(conn, ata(wattMint, alice.publicKey));
      const place = await placeAsk(program, {
        seller: alice.publicKey,
        wattMint,
        nonce: 2,
        price,
        amount: USDC(10),
      });
      await send([place], [alice]);
      expect(await bal(conn, ata(wattMint, alice.publicKey))).to.eq(before - USDC(10));
      const cancel = await cancelAsk(program, { seller: alice.publicKey, wattMint, nonce: 2 });
      await send([cancel], [alice]);
      expect(await bal(conn, ata(wattMint, alice.publicKey))).to.eq(before);
      const [askPda] = findAsk(alice.publicKey, 2, program.programId);
      expect(await conn.getAccountInfo(askPda)).to.be.null;
    });

    it("only the seller can cancel", async () => {
      const place = await placeAsk(program, {
        seller: alice.publicKey,
        wattMint,
        nonce: 3,
        price,
        amount: USDC(1),
      });
      await send([place], [alice]);
      const [askPda] = findAsk(alice.publicKey, 3, program.programId);
      try {
        await program.methods
          .cancelAsk()
          .accountsPartial({ seller: bob.publicKey, wattMint, ask: askPda })
          .signers([bob])
          .rpc();
        assert.fail("should fail");
      } catch (e: any) {
        expect(String(e)).to.match(/Unauthorized|ConstraintSeeds|ConstraintHasOne|2006|2001|6003/);
      }
    });
  });

  it("set_keeper / set_params are admin only", async () => {
    try {
      await program.methods.setKeeper(bob.publicKey).accountsPartial({ admin: bob.publicKey }).signers([bob]).rpc();
      assert.fail("should fail");
    } catch (e: any) {
      expect(String(e)).to.match(/Unauthorized|ConstraintHasOne|2001|6003/);
    }
    await program.methods
      .setParams({
        treasury: null,
        fundingWallet: null,
        purchaseFeeBps: 300,
        activationFeeBps: null,
        buyerFeeBps: null,
        treasuryShareBps: null,
        flushInterval: new BN(10),
        minFlushUsdc: null,
      })
      .accountsPartial({ admin: admin.publicKey })
      .rpc();
    const cfg = await fetchConfig(program);
    expect(cfg.purchaseFeeBps).to.eq(300);
    expect(cfg.flushInterval.toNumber()).to.eq(10);
  });
});
