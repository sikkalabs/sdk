import { SikkaClient } from './api.js';
import { 
  generateMnemonic, 
  validateMnemonic, 
  normalizeMnemonic, 
  seedFromMnemonic 
} from './bip39.js';
import { derivePathSeed, deriveAddressFromSeed } from './crypto.js';
import { PrivateKeyWallet } from './wallet.js';
import { bytesToHex } from './utils.js';

export class HDWallet {
  constructor({ mnemonic, passphrase = '', client = null, nodeURL = null } = {}) {
    let normalizedMnemonic;
    if (mnemonic) {
      normalizedMnemonic = normalizeMnemonic(mnemonic);
      if (!validateMnemonic(normalizedMnemonic)) {
        throw new Error("Invalid BIP-39 mnemonic phrase");
      }
    } else {
      normalizedMnemonic = generateMnemonic(256);
    }

    this.mnemonic = normalizedMnemonic;
    this.passphrase = passphrase;
    this.client = client || new SikkaClient({ nodeURL: nodeURL || 'http://127.0.0.1:64552' });

    this.masterSeed = seedFromMnemonic(this.mnemonic, this.passphrase);
    this.masterSeedHex = bytesToHex(this.masterSeed);
    this.walletCache = new Map();
  }

  static createRandom(wordCount = 24, options = {}) {
    const strength = wordCount === 12 ? 128 : 256;
    const mnemonic = generateMnemonic(strength);
    return new HDWallet({ mnemonic, ...options });
  }

  static fromMnemonic(mnemonic, options = {}) {
    return new HDWallet({ mnemonic, ...options });
  }

  getAccountWallet(index = 0, branch = 0, account = 0) {
    const cacheKey = `${account}:${branch}:${index}`;
    if (this.walletCache.has(cacheKey)) {
      return this.walletCache.get(cacheKey);
    }

    const childSeedBytes = derivePathSeed(this.masterSeed, account, branch, index);
    const childSeedHex = bytesToHex(childSeedBytes);
    const wallet = new PrivateKeyWallet(childSeedHex, { client: this.client });

    this.walletCache.set(cacheKey, wallet);
    return wallet;
  }

  async getReceiveAddress(index = 0) {
    const wallet = this.getAccountWallet(index, 0);
    return wallet.address;
  }

  async getChangeAddress(index = 0) {
    const wallet = this.getAccountWallet(index, 1);
    return wallet.address;
  }

  async getBalance(index = 0) {
    const wallet = this.getAccountWallet(index, 0);
    return await wallet.getBalance();
  }

  async getHistory(index = 0) {
    const wallet = this.getAccountWallet(index, 0);
    return await wallet.getHistory();
  }

  async sendTransaction({ to, amount, memo = null, index = 0, minPowBits = null }) {
    const wallet = this.getAccountWallet(index, 0);
    return await wallet.sendTransaction({ to, amount, memo, minPowBits });
  }
}
