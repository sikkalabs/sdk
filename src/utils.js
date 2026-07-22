export function hexToBytes(hex) {
  if (hex.length % 2 !== 0) throw new Error("Invalid hex length");
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export function bytesToHex(bytes) {
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

export function selectUTXOs(utxos, targetAmount, strategy = 'fifo', maxInputs = 64) {
  const target = BigInt(targetAmount);
  if (!utxos || utxos.length === 0) {
    return { selected: [], total: 0n, fee: 0n };
  }

  let candidates = [...utxos];

  if (strategy === 'largest-first') {
    candidates.sort((a, b) => (BigInt(b.value) > BigInt(a.value) ? 1 : -1));
  } else if (strategy === 'smallest-first') {
    candidates.sort((a, b) => (BigInt(a.value) > BigInt(b.value) ? 1 : -1));
  } else if (strategy === 'optimal') {
    // Look for exact match or single output with minimal excess
    const singleBest = candidates
      .filter(u => BigInt(u.value) >= target)
      .sort((a, b) => (BigInt(a.value) > BigInt(b.value) ? 1 : -1))[0];
    if (singleBest) {
      return { selected: [singleBest], total: BigInt(singleBest.value) };
    }
    // Fallback to largest-first if no single UTXO is sufficient
    candidates.sort((a, b) => (BigInt(b.value) > BigInt(a.value) ? 1 : -1));
  }

  const selected = [];
  let total = 0n;

  for (const utxo of candidates) {
    selected.push(utxo);
    total += BigInt(utxo.value);
    if (total >= target) break;
    if (selected.length >= maxInputs) break;
  }

  return { selected, total };
}

