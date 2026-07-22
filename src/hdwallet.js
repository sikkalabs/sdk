import { APIClient } from './api.js';
import { 
  generateMnemonic, 
  validateMnemonic, 
  normalizeMnemonic 
} from './bip39.js';
import { 
  seedFromMnemonic, 
  derivePathSeed, 
  createWallet as cryptoCreateWallet, 
  generateSigningPayload, 
  signTransactionInput, 
  mineProofOfWork, 
  computeTransactionIdBytes 
} from './crypto.js';
import { validateAddress } from './bech32m.js';
import { bytesToHex } from './utils.js';

export const MIN_UTXO_MATURITY_SECONDS = 600;
export const MAX_TX_INPUTS = 64;
export const MAX_TX_OUTPUTS = 256;

export class SikkaHDWallet {
  constructor({ mnemonic, passphrase = "", nodeURL = 'https://1.sikkalabs.com', gapLimit = 10 } = {}) {
    if (mnemonic) {
      const normalized = normalizeMnemonic(mnemonic);
      if (!validateMnemonic(normalized)) {
        throw new Error("Invalid BIP-39 mnemonic phrase");
      }
      this.mnemonic = normalized;
    } else {
      this.mnemonic = generateMnemonic(256);
    }

    this.passphrase = passphrase;
    this.gapLimit = gapLimit;
    this.api = new APIClient(nodeURL);

    this.masterSeed = seedFromMnemonic(this.mnemonic, this.passphrase);
    this.masterSeedHex = bytesToHex(this.masterSeed);

    this.addressCache = new Map();
    this.pathCache = new Map();
  }

  parsePath(pathOrIndex = 0, branch = 0, index = 0) {
    if (typeof pathOrIndex === 'string') {
      const clean = pathOrIndex.replace(/^m\//i, '').trim();
      const parts = clean.split('/').map(p => parseInt(p, 10));
      if (parts.some(isNaN)) {
        throw new Error(`Invalid HD path string: "${pathOrIndex}"`);
      }
      if (parts.length === 1) return { account: 0, branch: 0, index: parts[0] };
      if (parts.length === 2) return { account: 0, branch: parts[0], index: parts[1] };
      return { account: parts[0], branch: parts[1], index: parts[2] };
    }
    if (typeof pathOrIndex === 'object' && pathOrIndex !== null) {
      return {
        account: pathOrIndex.account ?? 0,
        branch: pathOrIndex.branch ?? 0,
        index: pathOrIndex.index ?? 0
      };
    }
    return {
      account: Number(pathOrIndex || 0),
      branch: Number(branch || 0),
      index: Number(index || 0)
    };
  }

  async getWalletForPath(account = 0, branch = 0, index = 0) {
    const key = `${account}:${branch}:${index}`;
    if (this.pathCache.has(key)) {
      return this.pathCache.get(key);
    }

    const childSeed = derivePathSeed(this.masterSeed, account, branch, index);
    const childSeedHex = bytesToHex(childSeed);
    const wallet = await cryptoCreateWallet(childSeedHex);

    const walletObj = {
      ...wallet,
      account,
      branch,
      index
    };

    this.pathCache.set(key, walletObj);
    this.addressCache.set(wallet.address, walletObj);
    return walletObj;
  }

  async getReceiveAddress(pathOrIndex = 0) {
    if (typeof pathOrIndex === 'string' || typeof pathOrIndex === 'object') {
      const { account, branch, index } = this.parsePath(pathOrIndex);
      const wallet = await this.getWalletForPath(account, branch, index);
      return wallet.address;
    }
    const wallet = await this.getWalletForPath(0, 0, Number(pathOrIndex || 0));
    return wallet.address;
  }

  async getChangeAddress(pathOrIndex = 0) {
    if (typeof pathOrIndex === 'string' || typeof pathOrIndex === 'object') {
      const { account, branch, index } = this.parsePath(pathOrIndex);
      const wallet = await this.getWalletForPath(account, branch, index);
      return wallet.address;
    }
    const wallet = await this.getWalletForPath(0, 1, Number(pathOrIndex || 0));
    return wallet.address;
  }

  // Shorthand aliases & Flexible Address Deriver
  async address(pathOrIndex = 0, branch = 0, index = 0) {
    const p = this.parsePath(pathOrIndex, branch, index);
    const wallet = await this.getWalletForPath(p.account, p.branch, p.index);
    return wallet.address;
  }

  async receiveAddress(pathOrIndex = 0) {
    return await this.getReceiveAddress(pathOrIndex);
  }

  async changeAddress(pathOrIndex = 0) {
    return await this.getChangeAddress(pathOrIndex);
  }

  getStorageKey() {
    let hash = 0;
    if (this.mnemonic) {
      for (let i = 0; i < this.mnemonic.length; i++) {
        hash = ((hash << 5) - hash) + this.mnemonic.charCodeAt(i);
        hash |= 0;
      }
    }
    return `sikka_used_indices_${Math.abs(hash)}`;
  }

  getKnownUsedIndices() {
    try {
      const key = this.getStorageKey();
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : { receive: [], change: [] };
    } catch {
      return { receive: [], change: [] };
    }
  }

  saveKnownUsedIndex(branch, index) {
    try {
      const known = this.getKnownUsedIndices();
      const list = branch === 0 ? known.receive : known.change;
      if (!list.includes(index)) {
        list.push(index);
        localStorage.setItem(this.getStorageKey(), JSON.stringify(known));
      }
    } catch {}
  }

  async scanAddresses() {
    if (this._scanCache && (Date.now() - (this._scanCacheTime || 0) < 5000)) {
      return this._scanCache;
    }

    const allUtxos = [];
    const usedAddresses = [];
    let nextReceiveIndex = 0;
    let nextChangeIndex = 0;

    const now = Math.floor(Date.now() / 1000);
    const known = this.getKnownUsedIndices();

    // Scan Receive Addresses (Branch 0)
    let consecutiveUnusedReceive = 0;
    for (let index = 0; consecutiveUnusedReceive < this.gapLimit || known.receive.includes(index); index++) {
      const wallet = await this.getWalletForPath(0, 0, index);
      let info;
      try {
        info = await this.api.getAddressInfo(wallet.address);
      } catch (err) {
        info = { balance: 0, utxo_count: 0, unspentOutputs: [] };
      }

      const hasUTXOs = (info.utxo_count > 0) || (BigInt(info.balance || 0) > 0n) || (info.unspentOutputs && info.unspentOutputs.length > 0);
      const isKnownUsed = known.receive.includes(index);

      let hasHistory = false;
      if (!hasUTXOs && !isKnownUsed) {
        try {
          const tail = await this.api.getSyncTail([wallet.address], 1);
          const items = Array.isArray(tail) ? tail : (tail?.items || []);
          if (items.length > 0) {
            hasHistory = true;
          }
        } catch (e) {}
      }

      const isUsed = hasUTXOs || isKnownUsed || hasHistory;

      if (isUsed) {
        this.saveKnownUsedIndex(0, index);
        consecutiveUnusedReceive = 0;
        nextReceiveIndex = index + 1;
        usedAddresses.push({
          address: wallet.address,
          branch: 0,
          index,
          balance: info.balance,
          utxo_count: info.utxo_count
        });

        if (info.unspentOutputs) {
          for (const utxo of info.unspentOutputs) {
            const createdAt = Number(utxo.created_at || now);
            const isImmature = utxo.created_at && (now < createdAt + MIN_UTXO_MATURITY_SECONDS);
            const remainingMaturitySeconds = isImmature ? Math.max(0, (createdAt + MIN_UTXO_MATURITY_SECONDS) - now) : 0;

            allUtxos.push({
              ...utxo,
              address: wallet.address,
              walletObj: wallet,
              isImmature: Boolean(isImmature),
              remainingMaturitySeconds
            });
          }
        }
      } else {
        consecutiveUnusedReceive++;
      }
    }

    // Scan Change Addresses (Branch 1)
    let consecutiveUnusedChange = 0;
    for (let index = 0; consecutiveUnusedChange < this.gapLimit || known.change.includes(index); index++) {
      const wallet = await this.getWalletForPath(0, 1, index);
      let info;
      try {
        info = await this.api.getAddressInfo(wallet.address);
      } catch (err) {
        info = { balance: 0, utxo_count: 0, unspentOutputs: [] };
      }

      const hasUTXOs = (info.utxo_count > 0) || (BigInt(info.balance || 0) > 0n) || (info.unspentOutputs && info.unspentOutputs.length > 0);
      const isKnownUsed = known.change.includes(index);

      let hasHistory = false;
      if (!hasUTXOs && !isKnownUsed) {
        try {
          const tail = await this.api.getSyncTail([wallet.address], 1);
          const items = Array.isArray(tail) ? tail : (tail?.items || []);
          if (items.length > 0) {
            hasHistory = true;
          }
        } catch (e) {}
      }

      const isUsed = hasUTXOs || isKnownUsed || hasHistory;

      if (isUsed) {
        this.saveKnownUsedIndex(1, index);
        consecutiveUnusedChange = 0;
        nextChangeIndex = index + 1;
        usedAddresses.push({
          address: wallet.address,
          branch: 1,
          index,
          balance: info.balance,
          utxo_count: info.utxo_count
        });

        if (info.unspentOutputs) {
          for (const utxo of info.unspentOutputs) {
            const createdAt = Number(utxo.created_at || now);
            const isImmature = utxo.created_at && (now < createdAt + MIN_UTXO_MATURITY_SECONDS);
            const remainingMaturitySeconds = isImmature ? Math.max(0, (createdAt + MIN_UTXO_MATURITY_SECONDS) - now) : 0;

            allUtxos.push({
              ...utxo,
              address: wallet.address,
              walletObj: wallet,
              isImmature: Boolean(isImmature),
              remainingMaturitySeconds
            });
          }
        }
      } else {
        consecutiveUnusedChange++;
      }
    }

    this.nextReceiveIndex = nextReceiveIndex;
    this.nextChangeIndex = nextChangeIndex;

    const result = {
      utxos: allUtxos,
      usedAddresses,
      nextReceiveIndex,
      nextChangeIndex
    };

    this._scanCache = result;
    this._scanCacheTime = Date.now();

    return result;
  }

  async getNewUnusedAddress() {
    const scan = await this.scanAddresses();
    const wallet = await this.getWalletForPath(0, 0, scan.nextReceiveIndex);
    return wallet.address;
  }

  async getUsedAddresses() {
    const scan = await this.scanAddresses();
    return scan.usedAddresses;
  }

  // Shorthand aliases
  async newAddress() {
    return await this.getNewUnusedAddress();
  }

  async unusedAddress() {
    return await this.getNewUnusedAddress();
  }

  async usedAddresses() {
    return await this.getUsedAddresses();
  }

  async balanceDetails() {
    const scan = await this.scanAddresses();
    let total = 0n;
    let spendable = 0n;
    let immature = 0n;
    let immatureCount = 0;
    let minMaturityRemainingSeconds = Infinity;

    for (const utxo of scan.utxos) {
      const val = BigInt(utxo.value);
      total += val;
      if (utxo.isImmature) {
        immature += val;
        immatureCount++;
        if (utxo.remainingMaturitySeconds < minMaturityRemainingSeconds) {
          minMaturityRemainingSeconds = utxo.remainingMaturitySeconds;
        }
      } else {
        spendable += val;
      }
    }

    if (minMaturityRemainingSeconds === Infinity) {
      minMaturityRemainingSeconds = 0;
    }

    return {
      total,
      spendable,
      immature,
      immatureCount,
      minMaturityRemainingSeconds
    };
  }

  async balance() {
    const details = await this.balanceDetails();
    return details.total;
  }

  async send(amount, recipientAddr) {
    amount = BigInt(amount);
    if (amount <= 0n) {
      throw new Error("Amount must be greater than 0");
    }

    validateAddress(recipientAddr);

    const scan = await this.scanAddresses();
    const spendableUtxos = (scan.utxos || []).filter(u => !u.isImmature);
    if (!spendableUtxos || spendableUtxos.length === 0) {
      throw new Error("Insufficient mature balance across HD wallet (no spendable outputs found - UTXOs require 10 minute maturity)");
    }

    const selectedUtxos = [];
    let inputTotal = 0n;
    for (const utxo of spendableUtxos) {
      selectedUtxos.push(utxo);
      inputTotal += BigInt(utxo.value);
      if (inputTotal >= amount) break;
    }

    if (inputTotal < amount) {
      throw new Error(`Insufficient balance across HD wallet. Have ${inputTotal}, need ${amount}`);
    }

    if (selectedUtxos.length > MAX_TX_INPUTS) {
      throw new Error(`Transaction exceeds maximum inputs limit of ${MAX_TX_INPUTS} (selected ${selectedUtxos.length})`);
    }

    const latestTips = await this.api.getLatestTransactionTips();

    const transactionOutputs = [{ address: recipientAddr, value: Number(amount) }];
    const changeAmount = inputTotal - amount;
    let changeWallet = null;

    if (changeAmount > 0n) {
      changeWallet = await this.getWalletForPath(0, 1, scan.nextChangeIndex);
      transactionOutputs.push({
        address: changeWallet.address,
        value: Number(changeAmount)
      });
    }

    if (transactionOutputs.length > MAX_TX_OUTPUTS) {
      throw new Error(`Transaction exceeds maximum outputs limit of ${MAX_TX_OUTPUTS}`);
    }

    const transactionInputs = selectedUtxos.map(utxo => ({
      txid: utxo.txid,
      index: utxo.index
    }));

    const transaction = {
      parents: latestTips,
      inputs: transactionInputs,
      outputs: transactionOutputs,
      timestamp: Math.floor(Date.now() / 1000)
    };

    // Sign each input with its specific child private key
    for (let i = 0; i < selectedUtxos.length; i++) {
      const utxo = selectedUtxos[i];
      const payloadToSign = generateSigningPayload(transaction, i, utxo);
      const signatureHex = await signTransactionInput(utxo.walletObj.privateKey, payloadToSign);
      
      transaction.inputs[i].witness = {
        type: "threshold",
        threshold: {
          threshold: 1,
          public_keys: [utxo.walletObj.pubKeyHex],
          signatures: [signatureHex]
        }
      };
    }

    // Get Proof of Work Quote & Mine
    const powQuote = await this.api.getProofOfWorkQuote(transaction);
    transaction.parent_pow_hashes = powQuote.parent_pow_hashes;
    await mineProofOfWork(transaction, powQuote.required_bits);

    // Compute Transaction ID & Submit
    const transactionIdBytes = computeTransactionIdBytes(transaction);
    transaction.id = Array.from(transactionIdBytes)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    const txID = await this.api.submitTransaction(transaction);
    return {
      txID,
      sentAmount: amount,
      changeAddress: changeWallet ? changeWallet.address : null
    };
  }

  async addressSpace() {
    const scan = await this.scanAddresses();
    const receiveAddresses = scan.usedAddresses.filter(u => u.branch === 0).map(u => u.address);
    const changeAddresses = scan.usedAddresses.filter(u => u.branch === 1).map(u => u.address);
    const allAddresses = scan.usedAddresses.map(u => u.address);
    const details = scan.usedAddresses;

    if (allAddresses.length === 0) {
      const primaryWallet = await this.getWalletForPath(0, 0, 0);
      allAddresses.push(primaryWallet.address);
      receiveAddresses.push(primaryWallet.address);
      details.push({
        address: primaryWallet.address,
        branch: 0,
        index: 0,
        balance: 0,
        utxo_count: 0
      });
    }

    return {
      addresses: allAddresses,
      receiveAddresses,
      changeAddresses,
      usedReceiveCount: receiveAddresses.length,
      usedChangeCount: changeAddresses.length,
      details
    };
  }

  async history(limit = 100) {
    const space = await this.addressSpace();
    const addresses = space.addresses;
    if (addresses.length === 0) {
      const primary = await this.getReceiveAddress(0);
      addresses.push(primary);
    }
    const res = await this.api.getSyncTail(addresses, limit);
    return Array.isArray(res) ? res : (res?.items || []);
  }
}

export async function createHDWallet(options = {}) {
  const wallet = new SikkaHDWallet(options);
  return wallet;
}

export const hdWallet = createHDWallet;
