import assert from 'node:assert';
import { 
  SikkaClient, 
  PrivateKeyWallet, 
  HDWallet,
  generateMnemonic, 
  validateMnemonic, 
  validateAddress,
  sikkaToChillar, 
  chillarToSikka,
  toChillar,
  toSikka,
  selectUTXOs
} from './src/index.js';

const NODE_URL = process.env.NODE_URL || 'https://1.sikkalabs.com';

async function runTestSuite() {
  console.log('⚡ Running Monorepo @sikkalabs/sdk Test Suite...\n');

  // Test 1: BIP-39 Mnemonic Generation & Validation
  console.log('Test 1: BIP-39 Mnemonic Generation & Validation');
  const m12 = generateMnemonic(128);
  assert.strictEqual(m12.split(' ').length, 12, '12-word mnemonic must have 12 words');
  assert.strictEqual(validateMnemonic(m12), true, 'Generated 12-word mnemonic must be valid');

  const m24 = generateMnemonic(256);
  assert.strictEqual(m24.split(' ').length, 24, '24-word mnemonic must have 24 words');
  assert.strictEqual(validateMnemonic(m24), true, 'Generated 24-word mnemonic must be valid');
  assert.strictEqual(validateMnemonic('invalid word sequence test'), false, 'Invalid phrase must fail validation');
  console.log('   ✅ Passed BIP-39 Mnemonic tests');

  // Test 2: PrivateKeyWallet Single-Key Derivation
  console.log('\nTest 2: PrivateKeyWallet Creation & Address Derivation');
  const testPrivKey = '3a5cdae29fc5627c2b4d1915bf5535b25aff7ba0bf010613ae0c24867943921e';
  const privWallet = PrivateKeyWallet.fromPrivateKey(testPrivKey, { nodeURL: NODE_URL });
  assert.strictEqual(privWallet.privateKeyHex, testPrivKey, 'Private key must match input');
  assert.strictEqual(privWallet.address, 'sikka1plxg2v2um76tv08drv72ln4hg7rtgfstfsmzfw86ussmwz759uy5sjdd30d', 'Address must be deterministic for raw seed');
  assert.strictEqual(validateAddress(privWallet.address), privWallet.address, 'Address must be valid Bech32m');

  const randWallet = PrivateKeyWallet.createRandom({ nodeURL: NODE_URL });
  assert.ok(randWallet.address.startsWith('sikka1'), 'Random wallet address must start with sikka1');
  console.log(`   ✅ PrivateKeyWallet Address: ${privWallet.address}`);

  // Test 3: HDWallet Mnemonic & Path Derivation
  console.log('\nTest 3: HDWallet Mnemonic & Account Derivation');
  const hdWallet = HDWallet.fromMnemonic(m24, { nodeURL: NODE_URL });
  const r0 = await hdWallet.getReceiveAddress(0);
  const r1 = await hdWallet.getReceiveAddress(1);
  const c0 = await hdWallet.getChangeAddress(0);

  assert.ok(r0.startsWith('sikka1'), 'Receive address #0 must be valid Bech32m');
  assert.ok(r1.startsWith('sikka1'), 'Receive address #1 must be valid Bech32m');
  assert.ok(c0.startsWith('sikka1'), 'Change address #0 must be valid Bech32m');
  assert.notStrictEqual(r0, r1, 'Distinct indices must derive distinct addresses');
  console.log(`   ✅ HD Receive #0: ${r0}`);
  console.log(`   ✅ HD Receive #1: ${r1}`);
  console.log(`   ✅ HD Change  #0: ${c0}`);

  // Test 4: Unit Conversions
  console.log('\nTest 4: Unit Conversions (SIKKA <-> Chillar)');
  assert.strictEqual(sikkaToChillar(1), 10000000000n, '1 SIKKA = 10,000,000,000 Chillar');
  assert.strictEqual(chillarToSikka(10000000000n), '1', '10B Chillar = 1 SIKKA');
  assert.strictEqual(toChillar(2.5), 25000000000n, '2.5 SIKKA = 25,000,000,000 Chillar');
  assert.strictEqual(toSikka(50000000000n), '5', '50B Chillar = 5 SIKKA');
  console.log('   ✅ Passed Unit Conversion tests');

  // Test 5: Simple UTXO Selection
  console.log('\nTest 5: Simple UTXO Selection Strategy');
  const sampleUtxos = [
    { txid: 'a', index: 0, value: 5000000000n },
    { txid: 'b', index: 0, value: 10000000000n },
    { txid: 'c', index: 0, value: 20000000000n }
  ];
  const { selected, total, change } = selectUTXOs(sampleUtxos, 12000000000n);
  assert.ok(selected.length > 0, 'Must select UTXOs');
  assert.strictEqual(total, 15000000000n, 'Total selected must equal sum of selected UTXOs');
  assert.strictEqual(change, 3000000000n, 'Change must equal total minus target');
  console.log('   ✅ Passed UTXO selection test');

  // Test 6: SikkaClient Live RPC Integration
  console.log('\nTest 6: SikkaClient Live RPC Integration');
  const client = new SikkaClient({ nodeURL: NODE_URL });
  const status = await client.getNodeStatus();
  assert.strictEqual(status.status, 'ok', 'Node status must be ok');
  assert.ok(status.genesis_id.length > 0, 'Node must return genesis_id');
  console.log(`   ✅ Connected to Node (Genesis ID: ${status.genesis_id.slice(0, 16)}...)`);

  const genesisAddr = 'sikka1psauw25zn4zes585epa6z0y9lepw29eflfcy6vktxu8txrhvamsyq4y7zaf';
  const genesisUtxos = await client.getUTXOs(genesisAddr);
  assert.strictEqual(genesisUtxos.status, 'ok', 'UTXO query must return status ok');
  console.log(`   ✅ Query UTXOs for Genesis Address (${genesisUtxos.count} UTXOs)`);

  const history = await client.getAddressHistory(genesisAddr);
  assert.strictEqual(history.status, 'ok', 'History query must return status ok');
  console.log(`   ✅ Query History for Genesis Address (${history.count} history items)`);

  const regResponse = await client.registerNode('sikkapeer99x8gf2t.onion:64552');
  assert.strictEqual(regResponse.status, 'ok', 'Node registration endpoint must return ok');
  console.log('   ✅ Successfully tested POST /v1/nodes/register');

  // Test 7: PrivateKeyWallet Live Self-Transfer (1 SIKKA) with 1-10s delay
  console.log('\nTest 7: PrivateKeyWallet Live Self-Transfer (1 SIKKA) with 1-10s delay');
  const userPrivKey = process.env.TEST_PRIVATE_KEY || 'd89d201cd4d0b371fb5e51de4385210a6132d622296a3e0923b68d28a0edb40a';
  const userWallet = PrivateKeyWallet.fromPrivateKey(userPrivKey, { nodeURL: NODE_URL });

  const waitTimeMs = Math.floor(Math.random() * 9000) + 1000;
  console.log(`   ⏳ Waiting ${(waitTimeMs / 1000).toFixed(2)}s before sending transaction...`);
  await new Promise(r => setTimeout(r, waitTimeMs));

  const selfTx = await userWallet.sendTransaction({
    to: userWallet.address,
    amount: 1,
    memo: 'Podman SDK self-send test 1 SIKKA'
  });
  assert.strictEqual(selfTx.status, 'ok', 'Self-transaction must return status ok');
  assert.ok(selfTx.txid.length === 64, 'Transaction ID must be 64 hex characters');
  console.log(`   ✅ Sent 1 SIKKA to self (${userWallet.address}) | TxID: ${selfTx.txid}`);

  console.log('\n🎉 ALL MONOREPO SDK TESTS PASSED SUCCESSFULLY!');
}

runTestSuite().catch(err => {
  console.error('\n❌ SDK Test Failed:', err);
  process.exit(1);
});
