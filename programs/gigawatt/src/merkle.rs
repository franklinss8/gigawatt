//! Merkle scheme shared with `packages/sdk/src/merkle.ts`.
//!
//! leaf = keccak256(0x00 || claimant(32) || amount_u64_le(8))
//! node = keccak256(0x01 || min(a,b) || max(a,b))   (sorted pairs → index-free proofs)

use anchor_lang::prelude::*;
use anchor_lang::solana_program::keccak;

pub const LEAF_PREFIX: u8 = 0x00;
pub const NODE_PREFIX: u8 = 0x01;

pub fn leaf_hash(claimant: &Pubkey, amount: u64) -> [u8; 32] {
    keccak::hashv(&[&[LEAF_PREFIX], claimant.as_ref(), &amount.to_le_bytes()]).to_bytes()
}

pub fn node_hash(a: &[u8; 32], b: &[u8; 32]) -> [u8; 32] {
    if a <= b {
        keccak::hashv(&[&[NODE_PREFIX], a, b]).to_bytes()
    } else {
        keccak::hashv(&[&[NODE_PREFIX], b, a]).to_bytes()
    }
}

pub fn verify(root: &[u8; 32], claimant: &Pubkey, amount: u64, proof: &[[u8; 32]]) -> bool {
    let mut computed = leaf_hash(claimant, amount);
    for sibling in proof {
        computed = node_hash(&computed, sibling);
    }
    &computed == root
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn known_vector() {
        // Must match packages/sdk/src/merkle.ts test vector.
        let a = Pubkey::new_from_array([1u8; 32]);
        let b = Pubkey::new_from_array([2u8; 32]);
        let c = Pubkey::new_from_array([3u8; 32]);
        let la = leaf_hash(&a, 100);
        let lb = leaf_hash(&b, 200);
        let lc = leaf_hash(&c, 300);
        let ab = node_hash(&la, &lb);
        let root = node_hash(&ab, &lc);
        assert!(verify(&root, &a, 100, &[lb, lc]));
        assert!(verify(&root, &b, 200, &[la, lc]));
        assert!(verify(&root, &c, 300, &[ab]));
        assert!(!verify(&root, &c, 301, &[ab]));
        println!("ROOT_HEX={}", hex(&root));
        println!("LEAF_A={}", hex(&la));
    }

    fn hex(b: &[u8]) -> String {
        b.iter().map(|x| format!("{:02x}", x)).collect()
    }
}
