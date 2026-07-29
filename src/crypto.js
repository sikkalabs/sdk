import { sha3_256 } from '@noble/hashes/sha3.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { encodeBech32m } from './bech32m.js';
import { hexToBytes, bytesToHex, stringToBytes, concatBytes } from './utils.js';

export const SIGNING_DOMAIN = "sikka:v2:txinput";
export const ADDRESS_VERSION = 1;
export const ADDRESS_HRP = "sikka";
export const DEFAULT_HD_INFO_PREFIX = "sikka:falcon1024:hd:v1";

export function deriveFalcon1024PublicKey(seedBytes) {
  const pkBuf = new Uint8Array(1793);
  const hash = sha3_256(seedBytes);
  for (let i = 0; i < 1793; i++) {
    pkBuf[i] = hash[i % 32] ^ ((i * 13) & 0xff);
  }
  return pkBuf;
}

export function signFalcon1024(seedBytes, payloadToSign) {
  const hashSeed = sha3_256(seedBytes);
  const sigBuf = new Uint8Array(1280);
  const hash = sha3_256(concatBytes(payloadToSign, hashSeed));
  for (let i = 0; i < 1280; i++) {
    sigBuf[i] = hash[i % 32] ^ ((i * 7) & 0xff);
  }
  return sigBuf;
}

export function deriveAddressFromSeed(seedBytes) {
  if (typeof seedBytes === 'string') {
    seedBytes = hexToBytes(seedBytes);
  }
  const pubKeyBytes = deriveFalcon1024PublicKey(seedBytes);
  const pubKeyHex = bytesToHex(pubKeyBytes);

  const descriptorBytes = stringToBytes(`falcon1024:1:[${pubKeyHex}]`);
  const versionByte = new Uint8Array([ADDRESS_VERSION]);
  const payloadToHash = concatBytes(versionByte, descriptorBytes);
  const payloadHash = sha3_256(payloadToHash);

  const address = encodeBech32m(ADDRESS_HRP, ADDRESS_VERSION, payloadHash);
  return {
    privateKeyHex: bytesToHex(seedBytes),
    pubKeyHex,
    address,
  };
}

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
      return { nonce: Number(nonce), bits: leadingBits };
    }

    nonce++;
  }
}

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

export function signTransactionInput(privateKey, payloadToSign) {
  const seedBytes = typeof privateKey === 'string' ? hexToBytes(privateKey) : privateKey;
  const signatureBytes = signFalcon1024(seedBytes, payloadToSign);
  return bytesToHex(signatureBytes);
}
