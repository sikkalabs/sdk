# ⚡ Sikka Monorepo JavaScript SDK (`@sikkalabs/sdk`)

Enterprise-grade, post-quantum JavaScript SDK for the **Sikka** cryptocurrency network, maintained directly within the primary monorepo workspace (`sikka/sdk`).

---

## 🌟 Features

- **🔑 Two Dedicated Wallet Paradigms**:
  1. **`PrivateKeyWallet`**: Single-key seed/private key wallet for fast, lightweight key management.
  2. **`HDWallet`**: Full Hierarchical Deterministic wallet supporting 12/24-word BIP-39 mnemonics and account path derivation (`m/0/0/index`).
- **🛡️ Post-Quantum Falcon-1024 Cryptography**: Quantum-resistant signatures and Bech32m address encoding (`sikka1...`).
- **⚡ Automated Proof-of-Work Mining**: Dynamic PoW difficulty fetching and execution.
- **📊 Simple & Robust UTXO Accumulator**: Efficient UTXO accumulator algorithm.
- **📡 Latest Node REST & MCP API**: Support for all node endpoints including `/v1/history/{address}` and `/v1/nodes/register`.
- **📘 Native TypeScript Support**: Full `.d.ts` definitions out of the box.

---

## 📦 Installation

```bash
npm install @sikkalabs/sdk
```

---

## 🚀 Quick Start

### 1. Using `PrivateKeyWallet` (Single-Key Wallet)

```javascript
import { PrivateKeyWallet, sikkaToChillar } from '@sikkalabs/sdk';

// Restore from 32-byte private key hex (or create random: PrivateKeyWallet.createRandom())
const wallet = PrivateKeyWallet.fromPrivateKey(
  '3a5cdae29fc5627c2b4d1915bf5535b25aff7ba0bf010613ae0c24867943921e',
  { nodeURL: 'http://127.0.0.1:64552' }
);

console.log('Wallet Address:', wallet.address);

// Query balance
const balance = await wallet.getBalance();
console.log(`Balance: ${balance.sikka} SIKKA (${balance.chillar} Chillar)`);

// Query full address history
const history = await wallet.getHistory();
console.log('Transaction History:', history);

// Send transaction (Auto-selects UTXOs, signs with Falcon-1024, mines PoW, submits)
const result = await wallet.sendTransaction({
  to: 'sikka1psauw25zn4zes585epa6z0y9lepw29eflfcy6vktxu8txrhvamsyq4y7zaf',
  amount: sikkaToChillar(1.5), // Send 1.5 SIKKA
  memo: 'Invoice #1042'
});

console.log('Transaction Submitted! TxID:', result.txid);
```

---

### 2. Using `HDWallet` (BIP-39 Mnemonic Wallet)

```javascript
import { HDWallet, sikkaToChillar } from '@sikkalabs/sdk';

// Generate or restore 24-word HD wallet
const wallet = HDWallet.fromMnemonic(
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
  { nodeURL: 'http://127.0.0.1:64552' }
);

// Derive receive & change addresses
const receiveAddr0 = await wallet.getReceiveAddress(0);
const receiveAddr1 = await wallet.getReceiveAddress(1);
const changeAddr0  = await wallet.getChangeAddress(0);

console.log('Receive Address #0:', receiveAddr0);
console.log('Receive Address #1:', receiveAddr1);

// Send payment from derived account #0
const txResult = await wallet.sendTransaction({
  to: 'sikka1psauw25zn4zes585epa6z0y9lepw29eflfcy6vktxu8txrhvamsyq4y7zaf',
  amount: sikkaToChillar(2.0),
  index: 0
});
```

---

### 3. Using `SikkaClient` (Low-Level RPC API)

```javascript
import { SikkaClient } from '@sikkalabs/sdk';

const client = new SikkaClient({ nodeURL: 'http://127.0.0.1:64552' });

// Node status & active tips
const status = await client.getNodeStatus();

// Address transaction history
const history = await client.getAddressHistory('sikka1...');

// Node self-registration
const reg = await client.registerNode('sikkapeer99x8gf2t.onion:64552');
```

---

## 🛠️ Unit Conversion

`1 SIKKA = 10,000,000,000 Chillar` (10 decimal places).

```javascript
import { sikkaToChillar, chillarToSikka } from '@sikkalabs/sdk';

const subunits = sikkaToChillar(2.5); // 25000000000n
const sikka    = chillarToSikka(25000000000n); // "2.5"
```
