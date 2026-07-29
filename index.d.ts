declare module '@sikkalabs/sdk' {
  export interface NodeStatusResponse {
    status: string;
    version: string;
    genesis_id: string;
    tips: string[];
    tips_count: number;
    onion_address: string;
    peer_count: number;
    addresses: string[];
  }

  export interface PowQuoteResponse {
    status: string;
    required_bits: number;
  }

  export interface UTXO {
    txid: string;
    index: number;
    address: string;
    value: number | string | bigint;
    dag_depth?: number;
    created_at?: number;
  }

  export interface AddressUTXOsResponse {
    status: string;
    address: string;
    utxos: UTXO[];
    count: number;
  }

  export interface AddressHistoryItem {
    txid: string;
    direction: 'incoming' | 'outgoing' | 'self' | 'none';
    received_amount: number;
    sent_amount: number;
    timestamp: number;
    depth: number;
    parents: string[];
    memo: string | null;
  }

  export interface AddressHistoryResponse {
    status: string;
    address: string;
    history: AddressHistoryItem[];
    count: number;
  }

  export interface TransactionSubmitResponse {
    status: string;
    txid: string;
    error?: string;
  }

  export interface NodeRegisterResponse {
    status: string;
    message: string;
    registered_node?: string;
    error?: string;
  }

  export interface SikkaClientOptions {
    nodeURL?: string;
    timeout?: number;
  }

  export class SikkaClient {
    constructor(options?: SikkaClientOptions);
    nodeURL: string;
    timeout: number;

    getHealth(): Promise<{ status: string }>;
    getNodeStatus(): Promise<NodeStatusResponse>;
    getPowQuote(parents?: string[]): Promise<PowQuoteResponse>;
    submitTransaction(transaction: any): Promise<TransactionSubmitResponse>;
    getTransaction(txId: string): Promise<{ status: string; transaction: any }>;
    getUTXOs(address: string): Promise<AddressUTXOsResponse>;
    getAddressHistory(address: string): Promise<AddressHistoryResponse>;
    getLatestSnapshot(): Promise<any>;
    getDiscoveryNodes(): Promise<{ items: Array<{ address: string; status: string }> }>;
    announceNode(address: string): Promise<any>;
    registerNode(address: string): Promise<NodeRegisterResponse>;
    getPeers(): Promise<{ status: string; peers: string[]; count: number }>;
    addPeer(address: string): Promise<any>;
    callMcp(method: string, params?: Record<string, any>): Promise<any>;
  }

  export const APIClient: typeof SikkaClient;

  export interface WalletBalance {
    chillar: bigint;
    sikka: string;
    utxoCount: number;
  }

  export interface SendTransactionOptions {
    to: string;
    amount: bigint | number;
    memo?: string | null;
    minPowBits?: number | null;
  }

  export interface WalletOptions {
    client?: SikkaClient;
    nodeURL?: string;
  }

  export class PrivateKeyWallet {
    constructor(privateKeyHex?: string | null, options?: WalletOptions);
    seedBytes: Uint8Array;
    privateKeyHex: string;
    pubKeyHex: string;
    address: string;
    client: SikkaClient;

    static createRandom(options?: WalletOptions): PrivateKeyWallet;
    static fromPrivateKey(privateKeyHex: string, options?: WalletOptions): PrivateKeyWallet;

    getBalance(): Promise<WalletBalance>;
    getUTXOs(): Promise<UTXO[]>;
    getHistory(): Promise<AddressHistoryItem[]>;
    sendTransaction(options: SendTransactionOptions): Promise<{
      txid: string;
      status: string;
      transaction: any;
    }>;
  }

  export interface HDWalletOptions extends WalletOptions {
    mnemonic?: string;
    passphrase?: string;
  }

  export class HDWallet {
    constructor(options?: HDWalletOptions);
    mnemonic: string;
    passphrase: string;
    masterSeed: Uint8Array;
    masterSeedHex: string;
    client: SikkaClient;

    static createRandom(wordCount?: 12 | 24, options?: HDWalletOptions): HDWallet;
    static fromMnemonic(mnemonic: string, options?: HDWalletOptions): HDWallet;

    getAccountWallet(index?: number, branch?: number, account?: number): PrivateKeyWallet;
    getReceiveAddress(index?: number): Promise<string>;
    getChangeAddress(index?: number): Promise<string>;
    getBalance(index?: number): Promise<WalletBalance>;
    getHistory(index?: number): Promise<AddressHistoryItem[]>;
    sendTransaction(options: SendTransactionOptions & { index?: number }): Promise<{
      txid: string;
      status: string;
      transaction: any;
    }>;
  }

  export function generateMnemonic(strength?: 128 | 256): string;
  export function validateMnemonic(mnemonic: string): boolean;
  export function normalizeMnemonic(mnemonic: string): string;
  export function seedFromMnemonic(mnemonic: string, passphrase?: string): Uint8Array;
  export function mnemonicToSeedSync(mnemonic: string, passphrase?: string): Uint8Array;

  export function encodeBech32m(hrp: string, version: number, program: Uint8Array): string;
  export function decodeBech32m(address: string): { hrp: string; version: number; program: Uint8Array };
  export function validateAddress(address: string): string;
  export function isValidAddress(address: string): boolean;

  export function sikkaToChillar(sikka: number | string): bigint;
  export function chillarToSikka(chillar: bigint | number | string): string;
  export function toChillar(sikka: number | string): bigint;
  export function toSikka(chillar: bigint | number | string): string;
  export const SUBUNITS_PER_SIKKA: bigint;
  export const CHILLAR_PER_SIKKA: bigint;

  export function selectUTXOs(
    utxos: UTXO[],
    targetAmount: bigint | number,
    maxInputs?: number
  ): { selected: UTXO[]; total: bigint; change: bigint };

  export function hexToBytes(hex: string): Uint8Array;
  export function bytesToHex(bytes: Uint8Array | number[]): string;
  export function stringToBytes(str: string): Uint8Array;
  export function concatBytes(...arrays: Uint8Array[]): Uint8Array;

  export function deriveMldsa87PublicKey(seedBytes: Uint8Array): Uint8Array;
  export function deriveMldsa87KeyPair(seedBytes: Uint8Array): {
    publicKey: Uint8Array;
    secretKey: Uint8Array;
  };
  export function signMldsa87(secretKey: Uint8Array, message: Uint8Array): Uint8Array;
  export function verifyMldsa87(
    signature: Uint8Array,
    message: Uint8Array,
    publicKey: Uint8Array
  ): boolean;
  export function deriveAddressFromSeed(seedBytes: Uint8Array | string): {
    privateKeyHex: string;
    pubKeyHex: string;
    address: string;
    secretKey: Uint8Array;
  };
  export function derivePathSeed(
    masterSeed: Uint8Array | string,
    account?: number,
    branch?: number,
    index?: number
  ): Uint8Array;
  export function generateSigningPayload(
    transaction: any,
    inputIndex: number,
    unspentOutput: UTXO
  ): Uint8Array;
  export function signTransactionInput(
    secretKeyOrSeed: Uint8Array | string,
    payloadToSign: Uint8Array
  ): string;
  export const MLDSA87_PUBLIC_KEY_BYTES: number;
  export const MLDSA87_SECRET_KEY_BYTES: number;
  export const MLDSA87_SIGNATURE_BYTES: number;
  export const MLDSA87_SEED_BYTES: number;
  export const SIGNING_DOMAIN: string;

  export class SikkaError extends Error {}
  export class InsufficientBalanceError extends SikkaError {
    required: bigint;
    available: bigint;
  }
  export class InvalidAddressError extends SikkaError {
    address: string;
  }
  export class InvalidMnemonicError extends SikkaError {}
  export class NetworkError extends SikkaError {
    statusCode: number;
    url: string;
  }
  export class PoWTimeoutError extends SikkaError {
    bits: number;
    attempts: number;
  }
}
