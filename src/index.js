import { APIClient } from './api.js';
import { 
  createWallet as cryptoCreateWallet, 
  createBrainWallet as cryptoCreateBrainWallet,
  createWalletFromMnemonic as cryptoCreateWalletFromMnemonic,
  createWalletFromPath as cryptoCreateWalletFromPath,
  seedFromMnemonic as cryptoSeedFromMnemonic,
  derivePathSeed as cryptoDerivePathSeed,
  computeTransactionIdBytes, 
  mineProofOfWork, 
  generateSigningPayload, 
  signTransactionInput 
} from './crypto.js';
import { generateMnemonic, validateMnemonic, normalizeMnemonic } from './bip39.js';
import { validateAddress } from './bech32m.js';
import { SikkaHDWallet, createHDWallet, hdWallet, MIN_UTXO_MATURITY_SECONDS, MAX_TX_INPUTS, MAX_TX_OUTPUTS } from './hdwallet.js';
import { 
  sikkaToChillar, 
  chillarToSikka, 
  toChillar, 
  toSikka, 
  fromChillar, 
  fromSikka, 
  CHILLAR_PER_SIKKA, 
  SIKKA_DECIMALS 
} from './units.js';
import { selectUTXOs } from './utils.js';
import { 
  SikkaError, 
  InsufficientBalanceError, 
  InvalidAddressError, 
  InvalidMnemonicError, 
  NetworkError, 
  PoWTimeoutError 
} from './errors.js';

export { 
  APIClient,
  generateMnemonic, 
  validateMnemonic, 
  normalizeMnemonic, 
  validateAddress, 
  SikkaHDWallet, 
  createHDWallet,
  hdWallet,
  MIN_UTXO_MATURITY_SECONDS,
  MAX_TX_INPUTS,
  MAX_TX_OUTPUTS,
  sikkaToChillar,
  chillarToSikka,
  toChillar,
  toSikka,
  fromChillar,
  fromSikka,
  CHILLAR_PER_SIKKA,
  SIKKA_DECIMALS,
  selectUTXOs,
  SikkaError,
  InsufficientBalanceError,
  InvalidAddressError,
  InvalidMnemonicError,
  NetworkError,
  PoWTimeoutError
};

// Intuitive Shorthand Aliases
export const newMnemonic = generateMnemonic;
export const isValidMnemonic = validateMnemonic;
export const isValidAddress = validateAddress;

export async function createWallet(seedHex) {
  return await cryptoCreateWallet(seedHex);
}

export async function createBrainWallet(passphrase) {
  return await cryptoCreateBrainWallet(passphrase);
}

export async function createWalletFromMnemonic(mnemonic, passphrase = "") {
  return await cryptoCreateWalletFromMnemonic(mnemonic, passphrase);
}

export async function createWalletFromPath(masterSeed, account = 0, branch = 0, index = 0) {
  return await cryptoCreateWalletFromPath(masterSeed, account, branch, index);
}

export function seedFromMnemonic(mnemonic, passphrase = "") {
  return cryptoSeedFromMnemonic(mnemonic, passphrase);
}

export function derivePathSeed(masterSeed, account = 0, branch = 0, index = 0) {
  return cryptoDerivePathSeed(masterSeed, account, branch, index);
}

export const wallet = createWallet;
export const brainWallet = createBrainWallet;
export const walletFromMnemonic = createWalletFromMnemonic;
export const walletFromPath = createWalletFromPath;
export const fromMnemonic = createWalletFromMnemonic;
export const fromPath = createWalletFromPath;

export class SikkaClient {
  constructor({ nodeURL = 'https://1.sikkalabs.com', wallet } = {}) {
    this.api = new APIClient(nodeURL);
    this.wallet = wallet;
  }

  async balance(address) {
    const targetAddress = address || (this.wallet && this.wallet.address);
    if (!targetAddress) {
      throw new Error("Address is required to get balance");
    }
    const addressInfo = await this.api.getAddressInfo(targetAddress);
    return addressInfo.balance;
  }

  async pow(transaction, minimumBits, options = {}) {
    return await mineProofOfWork(transaction, minimumBits, options);
  }

  async getTransaction(txid) {
    return await this.api.getTransaction(txid);
  }

  async getTransactionWeight(txid) {
    return await this.api.getTransactionWeight(txid);
  }

  async getDagTips() {
    return await this.api.getDagTips();
  }

  async getPeers() {
    return await this.api.getPeers();
  }

  async getAddressHistory(address, options = {}) {
    const targetAddress = address || (this.wallet && this.wallet.address);
    if (!targetAddress) {
      throw new Error("Address is required to get address history");
    }
    return await this.api.getAddressHistory(targetAddress, options);
  }

  async addressSpace(gapLimit = 20) {
    if (this.hdWallet && typeof this.hdWallet.addressSpace === 'function') {
      return await this.hdWallet.addressSpace(gapLimit);
    }
    const targetAddress = this.wallet ? this.wallet.address : null;
    return {
      addresses: targetAddress ? [targetAddress] : [],
      receiveAddresses: targetAddress ? [targetAddress] : [],
      changeAddresses: [],
      usedReceiveCount: targetAddress ? 1 : 0,
      usedChangeCount: 0,
      details: targetAddress ? [{ address: targetAddress, branch: 0, index: 0, balance: 0, utxo_count: 0 }] : []
    };
  }

  async history(address, limit = 100, gapLimit = 20) {
    if (!address && this.hdWallet && typeof this.hdWallet.history === 'function') {
      return await this.hdWallet.history(limit, gapLimit);
    }
    const targetAddress = address || (this.wallet && this.wallet.address);
    const addresses = targetAddress ? [targetAddress] : [];
    return await this.api.getSyncTail(addresses, limit);
  }

  async send(amount, recipientAddr, options = {}) {
    if (!this.wallet) {
      throw new Error("Wallet must be set in SikkaClient to send transactions");
    }
    
    amount = BigInt(amount);
    if (amount <= 0n) {
      throw new Error("Amount must be greater than 0");
    }

    validateAddress(recipientAddr);

    const { strategy = 'fifo', signal, onPoWProgress, maxInputs = MAX_TX_INPUTS } = options;
    
    const senderAddr = this.wallet.address;
    const addressInfo = await this.api.getAddressInfo(senderAddr);
    
    const currentBalance = BigInt(addressInfo.balance);
    if (currentBalance === 0n || !addressInfo.unspentOutputs || addressInfo.unspentOutputs.length === 0) {
      throw new InsufficientBalanceError(amount, 0n);
    }
    
    const { selected: selectedUtxos, total: inputTotal } = selectUTXOs(addressInfo.unspentOutputs, amount, strategy, maxInputs);
    
    if (inputTotal < amount) {
      throw new InsufficientBalanceError(amount, inputTotal);
    }
    
    const latestTips = await this.api.getLatestTransactionTips();
    
    const transactionOutputs = [{ address: recipientAddr, value: Number(amount) }];
    const changeAmount = inputTotal - amount;
    if (changeAmount > 0n) {
      transactionOutputs.push({ address: senderAddr, value: Number(changeAmount) });
    }
    
    const transactionInputs = selectedUtxos.map(utxo => ({ txid: utxo.txid, index: utxo.index }));
    
    const transaction = {
      parents: latestTips,
      inputs: transactionInputs,
      outputs: transactionOutputs,
      timestamp: Math.floor(Date.now() / 1000)
    };
    
    // Sign inputs
    for (let i = 0; i < selectedUtxos.length; i++) {
      const payloadToSign = generateSigningPayload(transaction, i, selectedUtxos[i]);
      const signatureHex = await signTransactionInput(this.wallet.privateKey, payloadToSign);
      transaction.inputs[i].witness = {
        type: "threshold",
        threshold: {
          threshold: 1,
          public_keys: [this.wallet.pubKeyHex],
          signatures: [signatureHex]
        }
      };
    }
    
    // Get Proof of Work Quote
    const powQuote = await this.api.getProofOfWorkQuote(transaction);
    transaction.parent_pow_hashes = powQuote.parent_pow_hashes;
    
    // Mine Proof of Work
    await this.pow(transaction, powQuote.required_bits, { signal, onProgress: onPoWProgress });
    
    // Compute final Transaction ID
    const transactionIdBytes = computeTransactionIdBytes(transaction);
    transaction.id = Array.from(transactionIdBytes)
      .map(byte => byte.toString(16).padStart(2, '0'))
      .join('');
    
    // Submit Transaction to Network
    const finalTxID = await this.api.submitTransaction(transaction);
    return { txID: finalTxID, sentAmount: amount };
  }
}
