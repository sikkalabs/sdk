export interface Wallet {
  privateKey: any;
  privKeyHex: string;
  pubKeyHex: string;
  address: string;
  masterSeedHex?: string;
  mnemonic?: string;
  pathSeedHex?: string;
  account?: number;
  branch?: number;
  index?: number;
}

export interface UTXO {
  txid: string;
  index: number;
  value: number | bigint;
  created_at?: number;
  isImmature?: boolean;
  remainingMaturitySeconds?: number;
  address?: string;
}

export interface TransactionInput {
  txid: string;
  index: number;
  witness?: {
    type: string;
    threshold: {
      threshold: number;
      public_keys: string[];
      signatures: string[];
    };
  };
}

export interface TransactionOutput {
  address: string;
  value: number;
}

export interface Transaction {
  parents: string[];
  inputs: TransactionInput[];
  outputs: TransactionOutput[];
  timestamp: number;
  parent_pow_hashes?: string[];
  pow_nonce?: number;
  pow_bits?: number;
  id?: string;
}

export interface PoWOptions {
  signal?: AbortSignal;
  onProgress?: (progress: { nonce: number; currentBits: number; minimumBits: number }) => void;
  maxIterations?: number;
}

export interface SendOptions extends PoWOptions {
  strategy?: 'fifo' | 'largest-first' | 'smallest-first' | 'optimal';
  maxInputs?: number;
}

export interface SikkaHDWalletOptions {
  mnemonic?: string;
  passphrase?: string;
  nodeURL?: string;
  gapLimit?: number;
}

export interface SikkaClientOptions {
  nodeURL?: string;
  wallet?: Wallet;
}

export interface AddressInfo {
  address: string;
  balance: number | string;
  utxo_count: number;
  unspentOutputs: UTXO[];
}

export interface BalanceDetails {
  total: bigint;
  spendable: bigint;
  immature: bigint;
  immatureCount: number;
  minMaturityRemainingSeconds: number;
}

export interface SendResult {
  txID: string;
  sentAmount: bigint;
  changeAddress?: string | null;
}

export class SikkaError extends Error {
  constructor(message: string);
}

export class InsufficientBalanceError extends SikkaError {
  required: bigint;
  available: bigint;
  constructor(required: bigint, available: bigint);
}

export class InvalidAddressError extends SikkaError {
  address: string;
  constructor(address: string, reason?: string);
}

export class InvalidMnemonicError extends SikkaError {
  constructor(reason?: string);
}

export class NetworkError extends SikkaError {
  statusCode: number;
  url: string;
  constructor(message: string, statusCode: number, url: string);
}

export class PoWTimeoutError extends SikkaError {
  bits: number;
  attempts: number;
  constructor(bits: number, attempts: number);
}

export interface DagTipsResponse {
  tips: string[];
  tip_count: number;
  max_dag_depth: number;
  tips_fingerprint: string;
}

export interface PeerInfo {
  address: string;
  score: number;
  latency_ms: number;
  last_seen: string;
  bootstrap: boolean;
  banned: boolean;
  banned_until?: string;
  penalty_points?: number;
}

export interface PeersResponse {
  peers: PeerInfo[];
  total_known: number;
  banned_count: number;
}

export interface AddressHistoryOptions {
  limit?: number;
  before?: string;
}

export interface AddressHistoryResponse {
  address: string;
  transactions: any[];
  count: number;
}

export class APIClient {
  constructor(nodeURL: string);
  getAddressInfo(address: string): Promise<AddressInfo>;
  getNodeStatus(): Promise<any>;
  getDagTips(): Promise<DagTipsResponse>;
  getLatestTransactionTips(): Promise<string[]>;
  getPeers(): Promise<PeersResponse>;
  getAddressHistory(address: string, options?: AddressHistoryOptions): Promise<AddressHistoryResponse>;
  getProofOfWorkQuote(transaction: Transaction): Promise<{ required_bits: number; parent_pow_hashes: string[] }>;
  submitTransaction(transaction: Transaction): Promise<string>;
  getTransaction(txid: string): Promise<any>;
  getTransactionWeight(txid: string): Promise<any>;
  getTransactions(txids: string[]): Promise<any>;
  getSyncTail(addresses?: string | string[], limit?: number): Promise<any>;
}

export class SikkaHDWallet {
  mnemonic: string;
  passphrase: string;
  masterSeedHex: string;
  gapLimit: number;
  api: APIClient;

  constructor(options?: SikkaHDWalletOptions);
  parsePath(pathOrIndex?: string | number | object, branch?: number, index?: number): { account: number; branch: number; index: number };
  getWalletForPath(account?: number, branch?: number, index?: number): Promise<Wallet>;
  getReceiveAddress(pathOrIndex?: string | number | object): Promise<string>;
  getChangeAddress(pathOrIndex?: string | number | object): Promise<string>;
  address(pathOrIndex?: string | number | object, branch?: number, index?: number): Promise<string>;
  receiveAddress(pathOrIndex?: string | number | object): Promise<string>;
  changeAddress(pathOrIndex?: string | number | object): Promise<string>;
  scanAddresses(): Promise<{ utxos: UTXO[]; usedAddresses: any[]; nextReceiveIndex: number; nextChangeIndex: number }>;
  getNewUnusedAddress(): Promise<string>;
  getUsedAddresses(): Promise<any[]>;
  newAddress(): Promise<string>;
  unusedAddress(): Promise<string>;
  usedAddresses(): Promise<any[]>;
  balanceDetails(): Promise<BalanceDetails>;
  balance(): Promise<bigint>;
  send(amount: bigint | number | string, recipientAddr: string, options?: SendOptions): Promise<SendResult>;
  getSpendableUtxos(): Promise<UTXO[]>;
  getPendingUtxos(): Promise<UTXO[]>;
  addressSpace(): Promise<any>;
  getAddressHistory(address?: string, options?: AddressHistoryOptions): Promise<AddressHistoryResponse>;
  history(limit?: number): Promise<any>;
}

export class SikkaClient {
  api: APIClient;
  wallet?: Wallet;
  hdWallet?: SikkaHDWallet;

  constructor(options?: SikkaClientOptions);
  balance(address?: string): Promise<number | string>;
  pow(transaction: Transaction, minimumBits: number, options?: PoWOptions): Promise<{ nonce: number; bits: number }>;
  getTransaction(txid: string): Promise<any>;
  getTransactionWeight(txid: string): Promise<any>;
  getDagTips(): Promise<DagTipsResponse>;
  getPeers(): Promise<PeersResponse>;
  getAddressHistory(address?: string, options?: AddressHistoryOptions): Promise<AddressHistoryResponse>;
  addressSpace(gapLimit?: number): Promise<any>;
  history(address?: string, limit?: number, gapLimit?: number): Promise<any>;
  send(amount: bigint | number | string, recipientAddr: string, options?: SendOptions): Promise<SendResult>;
}

export function generateMnemonic(bits?: number): string;
export function validateMnemonic(mnemonic: string): boolean;
export function normalizeMnemonic(mnemonic: string): string;
export function validateAddress(address: string): string;

export function createWallet(seedHex?: string): Promise<Wallet>;
export function createBrainWallet(passphrase: string): Promise<Wallet>;
export function createWalletFromMnemonic(mnemonic: string, passphrase?: string): Promise<Wallet>;
export function createWalletFromPath(masterSeed: string | Uint8Array, account?: number, branch?: number, index?: number): Promise<Wallet>;
export function seedFromMnemonic(mnemonic: string, passphrase?: string): Uint8Array;
export function derivePathSeed(masterSeed: string | Uint8Array, account?: number, branch?: number, index?: number): Uint8Array;
export function createHDWallet(options?: SikkaHDWalletOptions): Promise<SikkaHDWallet>;
export const hdWallet: typeof createHDWallet;

export function sikkaToChillar(sikka: string | number | bigint): bigint;
export function chillarToSikka(chillar: string | number | bigint, format?: 'string'): string;
export function chillarToSikka(chillar: string | number | bigint, format: 'number'): number;

export const toChillar: typeof sikkaToChillar;
export const toSikka: typeof chillarToSikka;
export const fromChillar: typeof chillarToSikka;
export const fromSikka: typeof sikkaToChillar;

export const newMnemonic: typeof generateMnemonic;
export const isValidMnemonic: typeof validateMnemonic;
export const isValidAddress: typeof validateAddress;

export const wallet: typeof createWallet;
export const brainWallet: typeof createBrainWallet;
export const walletFromMnemonic: typeof createWalletFromMnemonic;
export const walletFromPath: typeof createWalletFromPath;
export const fromMnemonic: typeof createWalletFromMnemonic;
export const fromPath: typeof createWalletFromPath;

export function selectUTXOs(
  utxos: UTXO[],
  targetAmount: string | number | bigint,
  strategy?: 'fifo' | 'largest-first' | 'smallest-first' | 'optimal',
  maxInputs?: number
): { selected: UTXO[]; total: bigint };

export const MIN_UTXO_MATURITY_SECONDS: number;
export const MAX_TX_INPUTS: number;
export const MAX_TX_OUTPUTS: number;
export const CHILLAR_PER_SIKKA: bigint;
export const SIKKA_DECIMALS: number;
