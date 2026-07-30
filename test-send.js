import fs from 'node:fs';
import path from 'node:path';
import { PrivateKeyWallet, chillarToSikka } from './src/index.js';

const NODE_URL = process.env.NODE_URL || 'https://1.sikkalabs.com';
const TEST_FILE = path.join(process.cwd(), 'test.json');

async function main() {
  let wallet;

  if (fs.existsSync(TEST_FILE)) {
    console.log(`📂 Found existing test file: ${TEST_FILE}`);
    try {
      const content = fs.readFileSync(TEST_FILE, 'utf-8');
      const data = JSON.parse(content);
      if (!data.privateKey) {
        throw new Error('Invalid test.json format: missing privateKey');
      }
      wallet = PrivateKeyWallet.fromPrivateKey(data.privateKey, { nodeURL: NODE_URL });
      console.log(`🔑 Loaded wallet address: ${wallet.address}`);
    } catch (err) {
      console.error(`❌ Error loading ${TEST_FILE}:`, err.message);
      process.exit(1);
    }
  } else {
    console.log(`✨ Creating new wallet and saving to ${TEST_FILE}...`);
    wallet = PrivateKeyWallet.createRandom({ nodeURL: NODE_URL });
    const data = {
      privateKey: wallet.privateKeyHex,
      address: wallet.address,
      createdAt: new Date().toISOString(),
    };
    fs.writeFileSync(TEST_FILE, JSON.stringify(data, null, 2), 'utf-8');
    console.log(`✅ Saved new wallet to ${TEST_FILE}`);
    console.log(`🔑 Generated wallet address: ${wallet.address}`);
  }

  console.log(`\n📡 Monitoring balance every 10 seconds on ${NODE_URL}...`);
  console.log('Press Ctrl+C to stop.\n');

  const checkAndSend = async () => {
    try {
      const balance = await wallet.getBalance();
      const now = new Date().toLocaleTimeString();
      console.log(`[${now}] 💰 Balance: ${balance.sikka} SIKKA (${balance.chillar} Chillar) across ${balance.utxoCount} UTXO(s)`);

      if (balance.chillar > 0n) {
        // Random percentage from 10% to 50%
        const pct = Math.floor(Math.random() * 41) + 10;
        const sendChillar = (balance.chillar * BigInt(pct)) / 100n;

        if (sendChillar > 0n) {
          const sendSikka = chillarToSikka(sendChillar);
          console.log(`🚀 Sending ${pct}% of balance (${sendSikka} SIKKA) to self (${wallet.address})...`);
          
          const result = await wallet.sendTransaction({
            to: wallet.address,
            amount: sendChillar,
            memo: `Self test ${pct}%`,
          });

          console.log(`✅ Transaction submitted! TxID: ${result.txid}`);
        }
      } else {
        console.log(`   └─ Balance is 0 SIKKA. Waiting for funds...`);
      }
    } catch (err) {
      console.error(`❌ Error during check/send cycle:`, err.message);
    }
  };

  // Initial check
  await checkAndSend();

  // Check every 10 seconds
  setInterval(checkAndSend, 10000);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
