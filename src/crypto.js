import { sha3_256 } from '@noble/hashes/sha3.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { ml_dsa87 } from '@noble/post-quantum/ml-dsa.js';
import { encodeBech32m } from './bech32m.js';
import { hexToBytes, bytesToHex, stringToBytes, concatBytes } from './utils.js';

// --- Constants aligned with the Sikka node (src/crypto/signing.rs, src/crypto/address.rs) ---

export const SIGNING_DOMAIN = 'sikka:v2:txinput';
export const ADDRESS_VERSION = 1;
export const ADDRESS_HRP = 'sikka';

// ML-DSA-87 (FIPS-204) key/signature sizes — must match node's PK_LEN / SIG_LEN.
export const MLDSA87_PUBLIC_KEY_BYTES = 2592;
export const MLDSA87_SECRET_KEY_BYTES = 4896;
export const MLDSA87_SIGNATURE_BYTES = 4627;
export const MLDSA87_SEED_BYTES = 32;

// Empty FIPS-204 context string — matched by the node's `MLDSA87_CTX = b""`
// (src/crypto/mldsa.rs). Noble prepends `[0, ctx.length, ctx, ...msg]` per
// FIPS-204 §6.2 ML-DSA.Sign when ctx is empty/omitted, so we pass an empty
// Uint8Array explicitly for wire-level parity.
const EMPTY_CTX = new Uint8Array(0);

// HD path-derivation info prefix. Version bumped from "falcon1024" to "mldsa87"
// so child seeds derived from the same mnemonic do NOT collide with any prior
// Falcon-derived wallet — forces a clean key re-derivation on upgrade.
export const DEFAULT_HD_INFO_PREFIX = 'sikka:mldsa87:hd:v1';

// --- ML-DSA-87 key generation, signing, and verification ---

function assertSeedLength(seedBytes) {
  if (!(seedBytes instanceof Uint8Array) || seedBytes.length !== MLDSA87_SEED_BYTES) {
    throw new Error(
      `ML-DSA-87 seed must be ${MLDSA87_SEED_BYTES} bytes, got ${seedBytes?.length ?? 0}`
    );
  }
}

/**
 * Generates a real ML-DSA-87 (FIPS-204) keypair deterministically from a
 * 32-byte seed, using `@noble/post-quantum`. This is byte-compatible with
 * the Sikka node's `Mldsa87KeyPair::from_seed(&[u8; 32])` (which wraps the
 * `fips204` Rust crate) because FIPS-204 specifies the seed → key expansion
 * deterministically via SHAKE-256.
 *
 * @param {Uint8Array} seedBytes - 32-byte seed
 * @returns {{ publicKey: Uint8Array, secretKey: Uint8Array }}
 */
export function deriveMldsa87KeyPair(seedBytes) {
  if (typeof seedBytes === 'string') {
    seedBytes = hexToBytes(seedBytes);
  }
  assertSeedLength(seedBytes);
  return ml_dsa87.keygen(seedBytes);
}

/**
 * Derive the canonical 2592-byte ML-DSA-87 public key from a 32-byte seed.
 * Kept for API symmetry with the previous `deriveFalcon1024PublicKey`.
 *
 * @param {Uint8Array} seedBytes
 * @returns {Uint8Array} 2592-byte public key
 */
export function deriveMldsa87PublicKey(seedBytes) {
  return deriveMldsa87KeyPair(seedBytes).publicKey;
}

/**
 * Sign an arbitrary message with ML-DSA-87 using an empty FIPS-204 context,
 * matching the node's `Mldsa87KeyPair::sign(msg, MLDSA87_CTX)` call.
 *
 * @param {Uint8Array} secretKey - 4896-byte secret key (from `deriveMldsa87KeyPair`)
 * @param {Uint8Array} message - message/payload bytes to sign
 * @returns {Uint8Array} 4627-byte signature
 */
export function signMldsa87(secretKey, message) {
  if (!(secretKey instanceof Uint8Array) || secretKey.length !== MLDSA87_SECRET_KEY_BYTES) {
    throw new Error(
      `ML-DSA-87 secret key must be ${MLDSA87_SECRET_KEY_BYTES} bytes, got ${secretKey?.length ?? 0}`
    );
  }
  return ml_dsa87.sign(message, secretKey, { context: EMPTY_CTX });
}

/**
 * Verify an ML-DSA-87 signature with an empty FIPS-204 context.
 *
 * @param {Uint8Array} signature
 * @param {Uint8Array} message
 * @param {Uint8Array} publicKey
 * @returns {boolean}
 */
export function verifyMldsa87(signature, message, publicKey) {
  if (!(publicKey instanceof Uint8Array) || publicKey.length !== MLDSA87_PUBLIC_KEY_BYTES) {
    throw new Error(
      `ML-DSA-87 public key must be ${MLDSA87_PUBLIC_KEY_BYTES} bytes, got ${publicKey?.length ?? 0}`
    );
  }
  if (!(signature instanceof Uint8Array) || signature.length !== MLDSA87_SIGNATURE_BYTES) {
    throw new Error(
      `ML-DSA-87 signature must be ${MLDSA87_SIGNATURE_BYTES} bytes, got ${signature?.length ?? 0}`
    );
  }
  return ml_dsa87.verify(signature, message, publicKey, { context: EMPTY_CTX });
}

// --- Address derivation (mirrors src/crypto/address.rs::mldsa87_address) ---

/**
 * Derive the Bech32m Sikka payment address for a single-key ML-DSA-87 wallet.
 * Matches the node's `mldsa87_address(pk_hex)` which computes:
 *   descriptor = "mldsa87:1:[<pk_hex>]"
 *   payload    = sha3_256( 0x01 || descriptor_bytes )
 *   address    = bech32m_encode("sikka", 1, payload)
 *
 * @param {Uint8Array} seedBytes - 32-byte seed
 * @returns {{ privateKeyHex: string, pubKeyHex: string, address: string, secretKey: Uint8Array }}
 */
export function deriveAddressFromSeed(seedBytes) {
  if (typeof seedBytes === 'string') {
    seedBytes = hexToBytes(seedBytes);
  }
  const { publicKey, secretKey } = deriveMldsa87KeyPair(seedBytes);
  const pubKeyHex = bytesToHex(publicKey);

  const descriptorBytes = stringToBytes(`mldsa87:1:[${pubKeyHex}]`);
  const versionByte = new Uint8Array([ADDRESS_VERSION]);
  const payloadToHash = concatBytes(versionByte, descriptorBytes);
  const payloadHash = sha3_256(payloadToHash);

  const address = encodeBech32m(ADDRESS_HRP, ADDRESS_VERSION, payloadHash);
  return {
    privateKeyHex: bytesToHex(seedBytes),
    pubKeyHex,
    address,
    secretKey,
  };
}

// --- HD wallet path seed derivation ---

/**
 * Derive a 32-byte child seed for an HD wallet account/branch/index path,
 * using HKDF-SHA3 over a fixed info prefix. Output length matches
 * `MLDSA87_SEED_BYTES` so it can be fed straight into `deriveMldsa87KeyPair`.
 *
 * @param {Uint8Array|string} masterSeed - 32-byte master seed (from BIP-39)
 * @param {number} account
 * @param {number} branch  - 0 = receive, 1 = change
 * @param {number} index
 * @returns {Uint8Array} 32-byte child seed
 */
export function derivePathSeed(masterSeed, account = 0, branch = 0, index = 0) {
  let masterSeedBytes = typeof masterSeed === 'string' ? hexToBytes(masterSeed) : masterSeed;
  if (masterSeedBytes.length === 64) {
    masterSeedBytes = masterSeedBytes.slice(0, 32);
  } else if (masterSeedBytes.length !== 32) {
    throw new Error(`Master seed must be 32 bytes, got ${masterSeedBytes.length}`);
  }

  const prefixBytes = stringToBytes(DEFAULT_HD_INFO_PREFIX);
  const pathBuf = new Uint8Array(12);
  const view = new DataView(pathBuf.buffer);
  view.setUint32(0, account, false);
  view.setUint32(4, branch, false);
  view.setUint32(8, index, false);
  const infoBytes = concatBytes(prefixBytes, pathBuf);

  return hkdf(sha3_256, masterSeedBytes, undefined, infoBytes, 32);
}

// --- Transaction ID computation (mirrors src/types/transaction.rs::compute_id_raw) ---

/**
 * Compute the SHA3-256 transaction ID bytes from a transaction object.
 * Byte-for-byte compatible with the node's `Transaction::compute_id_raw()`.
 * Hashes a canonical CBOR-like body that excludes witnesses and the PoW
 * nonce, matching the consensus definition of the transaction's identity.
 *
 * @param {object} transaction
 * @returns {Uint8Array} 32-byte tx id
 */
export function computeTransactionIdBytes(transaction) {
  const buffers = [];
  buffers.push(new Uint8Array([0x02]));

  const numParents = new Uint8Array(4);
  new DataView(numParents.buffer).setUint32(0, transaction.parents.length, false);
  buffers.push(numParents);
  for (const parent of transaction.parents) {
    buffers.push(hexToBytes(parent));
  }

  const numInputs = new Uint8Array(4);
  new DataView(numInputs.buffer).setUint32(0, transaction.inputs.length, false);
  buffers.push(numInputs);
  for (const input of transaction.inputs) {
    buffers.push(hexToBytes(input.txid));
    const indexBuf = new Uint8Array(4);
    new DataView(indexBuf.buffer).setUint32(0, input.index, false);
    buffers.push(indexBuf);
  }

  const numOutputs = new Uint8Array(4);
  new DataView(numOutputs.buffer).setUint32(0, transaction.outputs.length, false);
  buffers.push(numOutputs);
  for (const output of transaction.outputs) {
    const addressBytes = stringToBytes(output.address);
    const addressLenBuf = new Uint8Array(2);
    new DataView(addressLenBuf.buffer).setUint16(0, addressBytes.length, false);
    buffers.push(addressLenBuf);
    buffers.push(addressBytes);

    const valueBuf = new Uint8Array(8);
    new DataView(valueBuf.buffer).setBigUint64(0, BigInt(output.value), false);
    buffers.push(valueBuf);
  }

  const timestampBuf = new Uint8Array(8);
  new DataView(timestampBuf.buffer).setBigUint64(0, BigInt(transaction.timestamp), false);
  buffers.push(timestampBuf);

  if (transaction.memo) {
    const memoBytes = stringToBytes(transaction.memo.slice(0, 32));
    const memoLenBuf = new Uint8Array(2);
    new DataView(memoLenBuf.buffer).setUint16(0, memoBytes.length, false);
    buffers.push(memoLenBuf);
    buffers.push(memoBytes);
  } else {
    buffers.push(new Uint8Array([0x00, 0x00]));
  }

  return sha3_256(concatBytes(...buffers));
}

export function countLeadingZeroBits(buffer) {
  let count = 0;
  for (const byte of buffer) {
    if (byte === 0) {
      count += 8;
      continue;
    }
    for (let bit = 7; bit >= 0; bit--) {
      if ((byte & (1 << bit)) !== 0) {
        return count;
      }
      count++;
    }
  }
  return count;
}

/**
 * Compute the PoW hash for a transaction: `sha3_256(tx_id || pph0 || pph1 || pow_nonce)`.
 * Mirrors `src/pow/solver.rs::tx_pow_hash`.
 *
 * @param {object} transaction
 * @returns {Uint8Array} 32-byte PoW hash
 */
export function computeTxPowHash(transaction) {
  const transactionIdBytes = computeTransactionIdBytes(transaction);

  let parentPowHash0 = new Uint8Array(32);
  let parentPowHash1 = new Uint8Array(32);

  if (transaction.parent_pow_hashes && transaction.parent_pow_hashes.length >= 1) {
    parentPowHash0 = hexToBytes(transaction.parent_pow_hashes[0]);
  }
  if (transaction.parent_pow_hashes && transaction.parent_pow_hashes.length >= 2) {
    parentPowHash1 = hexToBytes(transaction.parent_pow_hashes[1]);
  }

  const buffer = new Uint8Array(104);
  buffer.set(transactionIdBytes, 0);
  buffer.set(parentPowHash0, 32);
  buffer.set(parentPowHash1, 64);
  const view = new DataView(buffer.buffer);
  view.setBigUint64(96, BigInt(transaction.pow_nonce || 0), false);

  return sha3_256(buffer);
}

/**
 * Mine a Proof-of-Work solution by iterating `pow_nonce` until the PoW hash
 * has at least `minimumBits` leading-zero bits. Mutates the given transaction
 * in place (writing `pow_nonce` and `pow_bits`).
 *
 * Note: nonce is kept as a BigInt internally to avoid precision loss past
 * `Number.MAX_SAFE_INTEGER`. It is serialized as a u64 BE on the wire.
 *
 * @param {object} transaction
 * @param {number} minimumBits
 * @returns {{ nonce: bigint, bits: number }}
 */
export function mineProofOfWork(transaction, minimumBits = 0) {
  const transactionIdBytes = computeTransactionIdBytes(transaction);

  let parentPowHash0 = new Uint8Array(32);
  let parentPowHash1 = new Uint8Array(32);

  if (transaction.parent_pow_hashes && transaction.parent_pow_hashes.length >= 1) {
    parentPowHash0 = hexToBytes(transaction.parent_pow_hashes[0]);
  }
  if (transaction.parent_pow_hashes && transaction.parent_pow_hashes.length >= 2) {
    parentPowHash1 = hexToBytes(transaction.parent_pow_hashes[1]);
  }

  const buffer = new Uint8Array(104);
  buffer.set(transactionIdBytes, 0);
  buffer.set(parentPowHash0, 32);
  buffer.set(parentPowHash1, 64);
  const view = new DataView(buffer.buffer);

  let nonce = BigInt(transaction.pow_nonce || 0);

  while (true) {
    view.setBigUint64(96, nonce, false);
    const hash = sha3_256(buffer);
    const leadingBits = countLeadingZeroBits(hash);

    if (leadingBits >= minimumBits) {
      transaction.pow_nonce = Number(nonce);
      transaction.pow_bits = leadingBits;
      return { nonce, bits: leadingBits };
    }

    nonce += 1n;
  }
}

// --- Signing payload (mirrors src/crypto/signing.rs::compute_signing_payload) ---

/**
 * Build the domain-separated signing payload for a transaction input spend.
 * Byte-for-byte compatible with the node's `compute_signing_payload(...)`:
 *   SIGNING_DOMAIN || tx_id_raw || input_index(u64 BE) || spent_txid ||
 *   spent_index(u64 BE) || spent_value(u64 BE) || addr_len(u16 BE) || addr_bytes
 *
 * @param {object} transaction
 * @param {number} inputIndex
 * @param {object} unspentOutput - { txid, index, value, address }
 * @returns {Uint8Array}
 */
export function generateSigningPayload(transaction, inputIndex, unspentOutput) {
  const transactionIdBytes = computeTransactionIdBytes(transaction);
  const addressBytes = stringToBytes(unspentOutput.address);
  const spentTransactionId = hexToBytes(unspentOutput.txid);

  const buffers = [];
  buffers.push(stringToBytes(SIGNING_DOMAIN));
  buffers.push(transactionIdBytes);

  const inputIndexBuf = new Uint8Array(8);
  new DataView(inputIndexBuf.buffer).setBigUint64(0, BigInt(inputIndex), false);
  buffers.push(inputIndexBuf);

  buffers.push(spentTransactionId);

  const utxoIndexBuf = new Uint8Array(8);
  new DataView(utxoIndexBuf.buffer).setBigUint64(0, BigInt(unspentOutput.index), false);
  buffers.push(utxoIndexBuf);

  const valueBuf = new Uint8Array(8);
  new DataView(valueBuf.buffer).setBigUint64(0, BigInt(unspentOutput.value), false);
  buffers.push(valueBuf);

  const addressLenBuf = new Uint8Array(2);
  new DataView(addressLenBuf.buffer).setUint16(0, addressBytes.length, false);
  buffers.push(addressLenBuf);

  buffers.push(addressBytes);

  return concatBytes(...buffers);
}

/**
 * Sign a single transaction input with the holder's ML-DSA-87 secret key.
 *
 * @param {Uint8Array|string} secretKeyOrSeed - if 32 bytes, treated as a seed and
 *   the keypair is re-derived; if 4896 bytes, used directly as the secret key.
 *   The node-compatible canonical flow is seed → re-derive → sign, which is what
 *   `PrivateKeyWallet` uses.
 * @param {Uint8Array} payloadToSign - the output of `generateSigningPayload(...)`
 * @returns {string} hex-encoded 4627-byte signature
 */
export function signTransactionInput(secretKeyOrSeed, payloadToSign) {
  let secretKey;
  if (typeof secretKeyOrSeed === 'string') {
    const seedBytes = hexToBytes(secretKeyOrSeed);
    if (seedBytes.length === MLDSA87_SEED_BYTES) {
      secretKey = deriveMldsa87KeyPair(seedBytes).secretKey;
    } else if (seedBytes.length === MLDSA87_SECRET_KEY_BYTES) {
      secretKey = seedBytes;
    } else {
      throw new Error(
        `Expected ${MLDSA87_SEED_BYTES}-byte seed or ${MLDSA87_SECRET_KEY_BYTES}-byte secret key, got ${seedBytes.length} bytes`
      );
    }
  } else if (secretKeyOrSeed instanceof Uint8Array) {
    if (secretKeyOrSeed.length === MLDSA87_SEED_BYTES) {
      secretKey = deriveMldsa87KeyPair(secretKeyOrSeed).secretKey;
    } else if (secretKeyOrSeed.length === MLDSA87_SECRET_KEY_BYTES) {
      secretKey = secretKeyOrSeed;
    } else {
      throw new Error(
        `Expected ${MLDSA87_SEED_BYTES}-byte seed or ${MLDSA87_SECRET_KEY_BYTES}-byte secret key, got ${secretKeyOrSeed.length} bytes`
      );
    }
  } else {
    throw new TypeError('secretKeyOrSeed must be a Uint8Array or hex string');
  }

  const signatureBytes = signMldsa87(secretKey, payloadToSign);
  return bytesToHex(signatureBytes);
}

// --- Backwards-compat aliases for older SDK consumers ---
// These keep the public function names stable across the Falcon → ML-DSA
// migration while delegating to the real ML-DSA-87 implementation. They are
// deprecated; new code should call deriveMldsa87* / signMldsa87 directly.

/** @deprecated Use deriveMldsa87PublicKey */
export const deriveFalcon1024PublicKey = deriveMldsa87PublicKey;
/** @deprecated Use signMldsa87 */
export const signFalcon1024 = (seedBytes, payloadToSign) => {
  // Old signature: signFalcon1024(seed, payload) -> sig bytes
  const { secretKey } = deriveMldsa87KeyPair(seedBytes);
  return signMldsa87(secretKey, payloadToSign);
};
