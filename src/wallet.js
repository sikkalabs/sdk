import { sha3_256 } from '@noble/hashes/sha3.js';
import { SikkaClient } from './api.js';
import { 
  deriveAddressFromSeed, 
  generateSigningPayload, 
  signTransactionInput, 
  mineProofOfWork,
  computeTransactionIdBytes,
  computeTxPowHash,
  MLDSA87_SEED_BYTES
} from './crypto.js';
import { validateAddress } from './bech32m.js';
import { bytesToHex, selectUTXOs, stringToBytes } from './utils.js';
import { chillarToSikka, sikkaToChillar } from './units.js';

export class PrivateKeyWallet {
  constructor(privateKeyHex, options = {}) {
    let seedBytes;
    if (privateKeyHex) {
      const cleanHex = privateKeyHex.trim();
      if (cleanHex.length !== MLDSA87_SEED_BYTES * 2) {
        throw new Error(`Expected 32-byte seed (64 hex characters), got ${cleanHex.length}`);
      }
      const raw = Array.from({ length: MLDSA87_SEED_BYTES }, (_, i) => parseInt(cleanHex.substring(i * 2, i * 2 + 2), 16));
      seedBytes = new Uint8Array(raw);
    } else {
      seedBytes = new Uint8Array(MLDSA87_SEED_BYTES);
      crypto.getRandomValues(seedBytes);
    }

    const { privateKeyHex: privHex, pubKeyHex, address, secretKey } = deriveAddressFromSeed(seedBytes);
    this.seedBytes = seedBytes;
    this.privateKeyHex = privHex;
    this.pubKeyHex = pubKeyHex;
    this.address = address;
    // Cache the derived ML-DSA-87 secret key (4896 bytes) so signing does not
    // need to re-run keygen on every input. Knightly zeroization of this field
    // on wallet drop is the consumer's responsibility (it's a Uint8Array).
    this.secretKey = secretKey;

    this.client = options.client || new SikkaClient({ nodeURL: options.nodeURL });
  }

  static createRandom(options = {}) {
    return new PrivateKeyWallet(null, options);
  }

  static fromPrivateKey(privateKeyHex, options = {}) {
    return new PrivateKeyWallet(privateKeyHex, options);
  }

  static fromPassphrase(passphrase, options = {}) {
    if (typeof passphrase !== 'string') {
      throw new TypeError(`Passphrase must be a string, got ${typeof passphrase}`);
    }
    const seedBytes = sha3_256(stringToBytes(passphrase));
    const privateKeyHex = bytesToHex(seedBytes);
    return new PrivateKeyWallet(privateKeyHex, options);
  }

  static fromPassphare(passphrase, options = {}) {
    return PrivateKeyWallet.fromPassphrase(passphrase, options);
  }

  async getBalance() {
    const res = await this.client.getUTXOs(this.address);
    const utxos = res.utxos || [];
    let totalChillar = 0n;
    for (const utxo of utxos) {
      totalChillar += BigInt(utxo.value);
    }
    return {
      chillar: totalChillar,
      sikka: chillarToSikka(totalChillar),
      utxoCount: utxos.length,
    };
  }

  async getUTXOs() {
    const res = await this.client.getUTXOs(this.address);
    return res.utxos || [];
  }

  async getHistory() {
    const res = await this.client.getAddressHistory(this.address);
    return res.history || [];
  }

  async sendTransaction({ to, amount, memo = null, minPowBits = null }) {
    const recipientAddr = validateAddress(to);
    let targetAmount;
    if (typeof amount === 'bigint') {
      targetAmount = amount;
    } else {
      targetAmount = sikkaToChillar(amount);
    }

    if (targetAmount <= 0n) {
      throw new Error("Transaction amount must be greater than 0");
    }

    const status = await this.client.getNodeStatus();
    const tips = status.tips || [];
    if (tips.length === 0) {
      throw new Error("Node returned no DAG tips");
    }

    const parents = tips.slice(0, 2);
    while (parents.length < 2) {
      parents.push(parents[0]);
    }

    const parentPowHashes = [];
    for (const pId of parents) {
      try {
        const pTxRes = await this.client.getTransaction(pId);
        const pTx = pTxRes.transaction || pTxRes;
        const pPowHash = computeTxPowHash(pTx);
        parentPowHashes.push(bytesToHex(pPowHash));
      } catch (err) {
        parentPowHashes.push('00'.repeat(32));
      }
    }

    const availableUtxos = await this.getUTXOs();
    const { selected, total, change } = selectUTXOs(availableUtxos, targetAmount);

    const outputs = [
      {
        address: recipientAddr,
        value: Number(targetAmount),
      },
    ];

    if (change > 0n) {
      outputs.push({
        address: this.address,
        value: Number(change),
      });
    }

    const inputs = selected.map((utxo) => ({
      txid: utxo.txid,
      index: utxo.index,
      witness: {
        type: 'mldsa87',
        threshold: {
          threshold: 1,
          public_keys: [this.pubKeyHex],
          signatures: [],
        },
      },
    }));

    const rawTx = {
      id: '',
      parents,
      parent_pow_hashes: parentPowHashes,
      inputs,
      outputs,
      pow_nonce: 0,
      pow_bits: 0,
      timestamp: Math.floor(Date.now() / 1000),
      witness_stripped: null,
      memo: memo ? String(memo).slice(0, 32) : null,
    };

    const txIdBytes = computeTransactionIdBytes(rawTx);
    rawTx.id = bytesToHex(txIdBytes);

    for (let i = 0; i < selected.length; i++) {
      const payload = generateSigningPayload(rawTx, i, selected[i]);
      const signatureHex = signTransactionInput(this.secretKey, payload);
      rawTx.inputs[i].witness.threshold.signatures = [signatureHex];
    }

    let requiredBits = minPowBits;
    if (requiredBits === null || requiredBits === undefined) {
      const quote = await this.client.getPowQuote(parents);
      requiredBits = quote.required_bits !== undefined ? quote.required_bits : 1;
    }

    const bitsToMine = Math.max(1, requiredBits);
    mineProofOfWork(rawTx, bitsToMine);

    const result = await this.client.submitTransaction(rawTx);
    return {
      txid: result.txid || rawTx.id,
      status: result.status,
      transaction: rawTx,
    };
  }
}

export function fromPassphrase(passphrase, options = {}) {
  return PrivateKeyWallet.fromPassphrase(passphrase, options);
}

