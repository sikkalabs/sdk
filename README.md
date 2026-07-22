# ⚡ Sikka JavaScript & Browser SDK (`@sikkalabs/sdk`)

A lightweight, zero-dependency, post-quantum JavaScript SDK for the **Sikka** blockchain network. Built for modern Web browsers and Node.js environments.

Provides full wallet management, 24-word BIP-39 mnemonic seed phrases, Hierarchical Deterministic (HD) address derivation, NIST ML-DSA-87 signatures, high-performance automated Proof-of-Work (PoW) transaction mining, and customizable UTXO selection strategies.

---

## 🌟 Key Features

- **🛡️ Quantum-Resistant Cryptography**: Built-in support for **NIST ML-DSA-87** (Module-Lattice-Based Digital Signature Algorithm, FIPS 204) via WebAssembly (`mldsa-wasm`).
- **🔑 Complete Wallet Suite**: 
  - 12–24 word BIP-39 seed phrase generation & validation.
  - Hierarchical Deterministic (HD) path derivation (`account / branch / index`).
  - Raw 32-byte hex seed restoration & deterministic brain wallets.
- **⚡ High-Performance Proof-of-Work (PoW)**: Pre-allocated 104-byte buffer SHA3-256 PoW miner with zero runtime garbage collector allocations, `AbortSignal` cancellation support, and live progress callbacks.
- **🧵 Web Worker Background Mining**: Dedicated Web Worker module (`src/pow.worker.js`) to offload heavy PoW computation off the main browser UI thread.
- **📊 Advanced UTXO Selection**: Multiple selection strategies (`fifo`, `largest-first`, `smallest-first`, `optimal`).
- **🚨 Strongly Typed Custom Errors**: Clear, actionable error classes (`InsufficientBalanceError`, `InvalidAddressError`, `InvalidMnemonicError`, `PoWTimeoutError`, `NetworkError`).
- **📘 Native TypeScript Support**: Complete `.d.ts` declaration file included out of the box.
- **🌐 100% Browser & Node.js Compatible**: Standard Web Cryptography, `Uint8Array`, `DataView`, and native `fetch`. Zero legacy Node.js dependencies.

---

## 📦 Installation

Install directly via `npm`, `yarn`, `pnpm`, or `bun`:

```bash
# Install directly from GitHub:
npm install sikkalabs/sdk

# Or install a specific release tag / branch:
npm install sikkalabs/sdk#0.0.2
```

---

## 🚀 Quick Start (In 4 Simple Steps)

### Step 1: Create an All-in-One HD Wallet
```javascript
import { createHDWallet } from '@sikkalabs/sdk';

// 1. Create HD wallet (Generates a 24-word seed phrase if none provided)
const wallet = await createHDWallet({
  mnemonic: "optional 24 word mnemonic...", 
  passphrase: "optional-passphrase",
  nodeURL: "https://1.sikkalabs.com"
});

console.log("24-Word Seed Phrase:", wallet.mnemonic);

// 2. Get receive addresses and check total balance across all HD addresses
const receiveAddr = await wallet.getReceiveAddress();     // Default [0/0/0]
const newAddr     = await wallet.getNewUnusedAddress();   // Next clean receive address
const totalBal   = await wallet.balance();               // Aggregated balance across receive & change

// 3. Send Sikka (Auto-selects UTXOs, routes change to fresh address, signs & mines PoW)
const { txID, sentAmount, changeAddress } = await wallet.send(500000n, "sikka1...");
```

### Step 2: Initialize the Client
```javascript
import { SikkaClient } from '@sikkalabs/sdk';

const client = new SikkaClient({
  nodeURL: 'https://1.sikkalabs.com', // Default public node
  wallet: wallet
});
```

### Step 3: Check Your Balance
```javascript
// Amount is returned in "chillar" (1 Sikka = 10,000,000,000 chillar)
const balance = await client.balance();
console.log(`Current Balance: ${balance} chillar`);
```

### Step 4: Send Sikka (Automated PoW Mining & Signing)
```javascript
try {
  const recipientAddress = "sikka1pxarypt7u0aaxr870s0fp286kth009867syxmx25jcctley5zv9mqve907y";
  const amountToSend = 500000n; // 0.5 Sikka in chillar

  console.log("Mining Proof-of-Work and sending transaction...");
  const { txID, sentAmount } = await client.send(amountToSend, recipientAddress, {
    strategy: 'largest-first' // Optional UTXO selection strategy
  });
  
  console.log(`Successfully sent ${sentAmount} chillar! TxID: ${txID}`);
} catch (error) {
  console.error("Transaction failed:", error.message);
}
```

---

## 📖 Deep Dive: Wallet & Transaction Capabilities

### 1. Advanced UTXO Selection Strategies

Customize how unspent outputs are selected when constructing transactions:

```javascript
import { selectUTXOs } from '@sikkalabs/sdk';

// Strategies available:
// - 'fifo': First-in, first-out (Default)
// - 'largest-first': Pick largest UTXOs first to minimize input size
// - 'smallest-first': Consolidate small dust UTXOs into single change output
// - 'optimal': Select single UTXO matching target amount, or fallback to largest-first

const { selected, total } = selectUTXOs(utxoList, 500000n, 'largest-first');

// Usage directly inside wallet.send or client.send:
await wallet.send(500000n, recipientAddress, { strategy: 'optimal' });
```

---

### 2. High-Performance PoW Engine & Cancellation (`AbortSignal`)

PoW mining can be cancelled mid-operation (e.g. user navigation, transaction cancellation) and listened to via progress callbacks:

```javascript
const controller = new AbortController();

// Cancel mining after 5 seconds
setTimeout(() => controller.abort(), 5000);

try {
  await client.send(amount, recipient, {
    signal: controller.signal,
    onPoWProgress: ({ nonce, currentBits, minimumBits }) => {
      console.log(`Mining... Nonce: ${nonce}, Bits: ${currentBits}/${minimumBits}`);
    }
  });
} catch (err) {
  if (err.name === 'AbortError') {
    console.log("Transaction mining cancelled by user!");
  }
}
```

---

### 3. Web Worker Background PoW Mining (`src/pow.worker.js`)

Keep browser main UI thread responsive by running PoW mining in a background Web Worker:

```javascript
// Offload PoW to background worker
const worker = new Worker(new URL('@sikkalabs/sdk/src/pow.worker.js', import.meta.url), { type: 'module' });

worker.postMessage({
  id: 'tx-123',
  transaction: transactionObject,
  minimumBits: 18
});

worker.onmessage = (e) => {
  const { type, result, progress, error } = e.data;
  if (type === 'progress') {
    console.log("PoW progress:", progress);
  } else if (type === 'success') {
    console.log("PoW mined! Nonce:", result.nonce);
  } else if (type === 'error') {
    console.error("Worker PoW error:", error);
  }
};
```

---

### 4. Strongly Typed Custom Error Handling

The SDK provides specific error classes for clean error handling in applications:

```javascript
import { 
  InsufficientBalanceError, 
  InvalidAddressError, 
  InvalidMnemonicError, 
  NetworkError 
} from '@sikkalabs/sdk';

try {
  await wallet.send(amount, recipient);
} catch (err) {
  if (err instanceof InsufficientBalanceError) {
    console.error(`Required: ${err.required}, Available: ${err.available}`);
  } else if (err instanceof InvalidAddressError) {
    console.error(`Invalid address: ${err.address}`);
  } else if (err instanceof NetworkError) {
    console.error(`Network HTTP ${err.statusCode}: ${err.message}`);
  }
}
```

---

### 5. Generating & Restoring 24-Word Seed Phrases (BIP-39)

The Sikka protocol uses BIP-39 mnemonic phrases (12 to 24 words) combined with `HKDF-SHA3-256` key derivation.

```javascript
import { 
  generateMnemonic, 
  validateMnemonic, 
  createWalletFromMnemonic 
} from '@sikkalabs/sdk';

// Generate 256-bit entropy (24 words)
const mnemonic = generateMnemonic(256);

// Validate an incoming mnemonic phrase string
if (validateMnemonic(mnemonic)) {
  // Create wallet from mnemonic with optional extra passphrase
  const wallet = await createWalletFromMnemonic(mnemonic, "optional-user-passphrase");

  console.log("Address:", wallet.address);         // e.g. sikka1...
  console.log("Public Key:", wallet.pubKeyHex);    // 2592 bytes hex
  console.log("Private Seed:", wallet.privKeyHex); // 32 bytes hex
}
```

---

### 6. Hierarchical Deterministic (HD) Child Wallets

Derive multiple deterministic child wallets from a single master seed using Sikka's HD derivation rule (`account / branch / index`):

- **Branch `0`**: External / Receive addresses
- **Branch `1`**: Internal / Change addresses

```javascript
import { 
  seedFromMnemonic, 
  createWalletFromPath 
} from '@sikkalabs/sdk';

// 1. Derive 32-byte master seed from mnemonic
const masterSeed = seedFromMnemonic(mnemonic, "optional-passphrase");

// 2. Derive Receive Address 0 (account=0, branch=0, index=0)
const receive0 = await createWalletFromPath(masterSeed, 0, 0, 0);
console.log("Receive Address #0:", receive0.address);

// 3. Derive Receive Address 1 (account=0, branch=0, index=1)
const receive1 = await createWalletFromPath(masterSeed, 0, 0, 1);
console.log("Receive Address #1:", receive1.address);

// 4. Derive Change Address 0 (account=0, branch=1, index=0)
const change0 = await createWalletFromPath(masterSeed, 0, 1, 0);
console.log("Change Address #0:", change0.address);
```

---

## 🔬 Sikka Cryptography & Architecture Explained

### Post-Quantum Signatures (ML-DSA-87)
Sikka replaces legacy ECDSA/Ed25519 signatures with **ML-DSA-87** (NIST FIPS 204), protecting funds against quantum computer attacks.
- **Public Key Size**: 2,592 bytes
- **Signature Size**: 4,627 bytes

### Bech32m Address Format
A Sikka address is a Bech32m commitment to a 1-of-1 threshold policy:
$$\text{Address Payload} = \text{SHA3-256}( \texttt{0x01} \parallel \text{UTF8Bytes("mldsa87:1:[pubKeyHex]")} )$$
Formatted as Bech32m with prefix `sikka` and version `1` (e.g., `sikka1...`).

### How Proof-of-Work (PoW) Works
Transactions require client-side Proof-of-Work to prevent network spam:
1. `client.send(...)` fetches a PoW quote from the node (`/v1/tx/pow-quote`) returning target `required_bits` and DAG parent hashes.
2. The SDK mines a `pow_nonce` locally in JavaScript until:
   $$\text{LeadingZeroBits}(\text{SHA3-256}(\text{txID} \parallel \text{parentPow0} \parallel \text{parentPow1} \parallel \text{nonce})) \ge \text{required\_bits}$$
3. The signed transaction with PoW headers is broadcast to `/v1/tx/submit`.

---

## 🌐 Web Wallet UI Example

An interactive, post-quantum web wallet UI demo is included in [index.html](file:///home/jesus/Project/sikka/sdk/index.html).

It loads the SDK directly and demonstrates:
- 24-word seed generation & wallet restoration.
- HD address derivation (`account/branch/index`).
- Real-time balance queries across spendable UTXOs.
- Client-side SHA3-256 Proof-of-Work mining & transaction submission.
- Dynamic Sikka $\leftrightarrow$ Chillar unit conversion.

To launch locally:
```bash
npm run serve
```

---

## 🛠️ API Reference

### Core Functions & Shorthand Aliases

| Function / Shorthand | Alternative Name | Return Type | Description |
| :--- | :--- | :--- | :--- |
| `createHDWallet(options)` | `hdWallet(options)` | `Promise<SikkaHDWallet>` | Creates an all-in-one smart HD wallet. |
| `generateMnemonic(bits)` | `newMnemonic(bits)` | `string` | Generates 12–24 word BIP-39 mnemonic (default `256`). |
| `validateMnemonic(mnemonic)` | `isValidMnemonic(mnemonic)` | `boolean` | Checks word count, wordlist, and SHA-256 checksum. |
| `createWalletFromMnemonic()` | `fromMnemonic()` / `walletFromMnemonic()` | `Promise<Wallet>` | Derives ML-DSA-87 wallet from a 24-word seed phrase. |
| `createWalletFromPath()` | `fromPath()` / `walletFromPath()` | `Promise<Wallet>` | Derives HD child wallet for specified path. |
| `createWallet(seedHex?)` | `wallet(seedHex?)` | `Promise<Wallet>` | Creates a wallet from a 32-byte hex seed or random entropy. |
| `createBrainWallet(passphrase)` | `brainWallet(passphrase)` | `Promise<Wallet>` | Creates a wallet deterministically from any string. |
| `selectUTXOs(utxos, target, strategy?)` | - | `{ selected, total }` | Selects UTXOs using specified strategy. |
| `sikkaToChillar(sikka)` | `toChillar(sikka)` / `fromSikka(sikka)` | `bigint` | Converts Sikka amount to chillar (`1 Sikka = 10,000,000,000 chillar`). |
| `chillarToSikka(chillar)` | `toSikka(chillar)` / `fromChillar(chillar)` | `string \| number` | Converts chillar amount to Sikka formatted string or float. |
| `validateAddress(address)` | `isValidAddress(address)` | `string` | Validates a `sikka1...` Bech32m address string. |
| `apiClient.getDagTips()` | - | `Promise<DagTipsResponse>` | Fetches current unconfirmed DAG tips, depth, and tips fingerprint. |
| `apiClient.getPeers()` | - | `Promise<PeersResponse>` | Fetches peer health telemetry, RTT latency EMA (ms), and ban status. |
| `apiClient.getAddressHistory(addr, options)` | - | `Promise<AddressHistoryResponse>` | Fetches full historical transaction ledger for a given address. |

### Error Classes

| Class | Base Class | Description |
| :--- | :--- | :--- |
| `SikkaError` | `Error` | Base error class for all SDK exceptions. |
| `InsufficientBalanceError` | `SikkaError` | Thrown when UTXO balance is less than transaction send amount. |
| `InvalidAddressError` | `SikkaError` | Thrown when Bech32m address fails validation or checksum. |
| `InvalidMnemonicError` | `SikkaError` | Thrown when BIP-39 seed phrase validation fails. |
| `NetworkError` | `SikkaError` | Thrown when HTTP network request to Sikka node fails. |
| `PoWTimeoutError` | `SikkaError` | Thrown when PoW mining times out or exceeds max iterations. |

---

## 📜 License

ISC License. Built by [Sikka Labs](https://github.com/sikkalabs).
