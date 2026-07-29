import { InsufficientBalanceError } from './errors.js';

export function hexToBytes(hex) {
  if (typeof hex !== 'string') {
    throw new TypeError(`Expected hex string, got ${typeof hex}`);
  }
  const clean = hex.trim().replace(/^0x/i, '');
  if (clean.length % 2 !== 0) {
    throw new Error(`Invalid hex length: ${clean.length}`);
  }
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export function bytesToHex(bytes) {
  if (!(bytes instanceof Uint8Array)) {
    bytes = new Uint8Array(bytes);
  }
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export function stringToBytes(str) {
  return new TextEncoder().encode(str);
}

export function concatBytes(...arrays) {
  let totalLen = 0;
  for (const arr of arrays) totalLen += arr.length;
  const res = new Uint8Array(totalLen);
  let offset = 0;
  for (const arr of arrays) {
    res.set(arr, offset);
    offset += arr.length;
  }
  return res;
}

/**
 * Simple, robust UTXO selection strategy.
 * Accumulates UTXOs until target amount is covered.
 */
export function selectUTXOs(utxos, targetAmount, maxInputs = 64) {
  const target = BigInt(targetAmount);
  if (!Array.isArray(utxos) || utxos.length === 0) {
    throw new InsufficientBalanceError(target, 0n);
  }

  const selected = [];
  let total = 0n;

  for (const utxo of utxos) {
    const val = BigInt(utxo.value);
    selected.push(utxo);
    total += val;

    if (total >= target) {
      break;
    }
    if (selected.length >= maxInputs) {
      break;
    }
  }

  if (total < target) {
    throw new InsufficientBalanceError(target, total);
  }

  const change = total - target;

  return {
    selected,
    total,
    change
  };
}
