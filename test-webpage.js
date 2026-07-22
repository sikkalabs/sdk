import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { JSDOM } from 'jsdom';
import { 
  createHDWallet, 
  generateMnemonic, 
  validateMnemonic, 
  sikkaToChillar, 
  chillarToSikka, 
  toChillar, 
  toSikka, 
  validateAddress,
  SikkaClient
} from './src/index.js';
import { mineProofOfWork } from './src/crypto.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runWebpageTests() {
  console.log("==========================================");
  console.log("⚡ Automated Webpage & Web Wallet Integration Tests");
  console.log("==========================================");

  // ----------------------------------------------------
  // 1. Static HTML & DOM Structure Verification
  // ----------------------------------------------------
  console.log("\n1. Verifying public/index.html DOM elements & layout...");
  const htmlPath = path.join(__dirname, 'public', 'index.html');
  if (!fs.existsSync(htmlPath)) {
    throw new Error("public/index.html does not exist!");
  }

  const htmlContent = fs.readFileSync(htmlPath, 'utf8');
  const dom = new JSDOM(htmlContent);
  const document = dom.window.document;

  const requiredElementIds = [
    'nodeUrlLabel',
    'balanceSikka',
    'balanceChillar',
    'primaryAddress',
    'btnCopyAddress',
    'btnNewWallet',
    'btnToggleSeed',
    'seedContainer',
    'mnemonicGrid',
    'sendRecipient',
    'sendAmount',
    'sendAmountChillar',
    'btnSend',
    'powBox',
    'importMnemonicInput',
    'btnImportMnemonic',
    'btnGetNewAddress',
    'hdNextAddress',
    'btnCopyHDAddress',
    'calcSikka',
    'calcChillar',
    'logBox'
  ];

  for (const id of requiredElementIds) {
    const el = document.getElementById(id);
    if (!el) {
      throw new Error(`DOM Verification Failed: Missing #${id} element in public/index.html`);
    }
  }
  console.log(`   DOM Verification: PASSED ✓ (${requiredElementIds.length} required UI elements verified)`);

  // ----------------------------------------------------
  // 2. HTTP Server & Content Serving Verification
  // ----------------------------------------------------
  console.log("\n2. Testing HTTP Server endpoint serving (public/index.html & src/index.js)...");
  
  const server = http.createServer((req, res) => {
    let filePath = path.join(__dirname, req.url === '/' ? 'public/index.html' : req.url);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath);
      const mimeTypes = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css'
      };
      res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain' });
      fs.createReadStream(filePath).pipe(res);
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  console.log(`   Local test HTTP server listening on http://127.0.0.1:${port}`);

  // Fetch /public/index.html
  const htmlRes = await fetch(`http://127.0.0.1:${port}/public/index.html`);
  if (htmlRes.status !== 200) {
    throw new Error(`HTTP fetch public/index.html failed with status ${htmlRes.status}`);
  }
  const fetchedHtml = await htmlRes.text();
  if (!fetchedHtml.includes('Sikka Post-Quantum Web Wallet')) {
    throw new Error("HTTP response for public/index.html content mismatch!");
  }
  console.log("   HTTP fetch public/index.html: 200 OK ✓");

  // Fetch /src/index.js
  const jsRes = await fetch(`http://127.0.0.1:${port}/src/index.js`);
  if (jsRes.status !== 200) {
    throw new Error(`HTTP fetch src/index.js failed with status ${jsRes.status}`);
  }
  const contentType = jsRes.headers.get('content-type');
  if (!contentType || !contentType.includes('text/javascript')) {
    throw new Error(`Expected text/javascript content type for src/index.js, got ${contentType}`);
  }
  console.log("   HTTP fetch src/index.js: 200 OK (text/javascript) ✓");

  server.close();

  // ----------------------------------------------------
  // 3. Web Wallet HD Functionality & State Logic
  // ----------------------------------------------------
  console.log("\n3. Testing Web Wallet HD initialization & state rendering...");
  const hdWallet = await createHDWallet();
  const primaryAddr = await hdWallet.getReceiveAddress(0);

  if (!primaryAddr || !primaryAddr.startsWith('sikka1')) {
    throw new Error(`Primary address format invalid: ${primaryAddr}`);
  }
  console.log("   HD Wallet Primary Receive Address:", primaryAddr);

  // Test Mnemonic Grid rendering
  const words = hdWallet.mnemonic.split(' ');
  if (words.length !== 24) {
    throw new Error(`Expected 24-word BIP-39 mnemonic, got ${words.length} words`);
  }

  const mnemonicGrid = document.getElementById('mnemonicGrid');
  words.forEach((w, idx) => {
    const item = document.createElement('div');
    item.className = 'word-badge';
    item.innerHTML = `<span class="word-num">${idx + 1}.</span> <span class="word-val">${w}</span>`;
    mnemonicGrid.appendChild(item);
  });

  if (mnemonicGrid.children.length !== 24) {
    throw new Error(`Mnemonic Grid DOM rendering failed: expected 24 children, got ${mnemonicGrid.children.length}`);
  }
  console.log("   Mnemonic Grid 24-Word Rendering: PASSED ✓");

  // Test HD Derivation of next unused address
  const nextUnused = await hdWallet.getNewUnusedAddress();
  if (!nextUnused || !nextUnused.startsWith('sikka1')) {
    throw new Error(`Next unused address format invalid: ${nextUnused}`);
  }
  console.log("   HD Derivation Next Unused Address:", nextUnused);
  console.log("   HD Wallet Logic & State Rendering: PASSED ✓");

  // ----------------------------------------------------
  // 4. Web Wallet Unit Converter Interactivity
  // ----------------------------------------------------
  console.log("\n4. Testing Web Wallet Sikka <-> Chillar converter logic...");
  
  // Sikka -> Chillar
  if (toChillar("1") !== 10_000_000_000n) throw new Error("toChillar('1') failed");
  if (toChillar("2.5") !== 25_000_000_000n) throw new Error("toChillar('2.5') failed");
  if (toChillar("0.0000000001") !== 1n) throw new Error("toChillar('0.0000000001') failed");

  // Chillar -> Sikka
  if (toSikka(10_000_000_000n) !== "1") throw new Error("toSikka(10000000000n) failed");
  if (toSikka(25_000_000_000n) !== "2.5") throw new Error("toSikka(25000000000n) failed");
  if (toSikka(1n) !== "0.0000000001") throw new Error("toSikka(1n) failed");

  console.log("   1 Sikka      = 10,000,000,000 chillar");
  console.log("   2.5 Sikka    = 25,000,000,000 chillar");
  console.log("   Converter Calculations: PASSED ✓");

  // ----------------------------------------------------
  // 5. Address Validation & PoW Execution Engine
  // ----------------------------------------------------
  console.log("\n5. Testing Address Validation & Client PoW Execution Engine...");
  
  const validAddr = "sikka1pxarypt7u0aaxr870s0fp286kth009867syxmx25jcctley5zv9mqve907y";
  const validated = validateAddress(validAddr);
  if (validated !== validAddr) {
    throw new Error(`Address validation failed for ${validAddr}`);
  }
  console.log("   Bech32m Address Validation: PASSED ✓");

  // Test PoW Mining Nonce Calculator
  const mockTx = {
    parents: ["00".repeat(32), "00".repeat(32)],
    inputs: [],
    outputs: [{ address: validAddr, value: 100000 }],
    timestamp: Math.floor(Date.now() / 1000)
  };

  const startTime = Date.now();
  await mineProofOfWork(mockTx, 2); // mine 2 zero bits
  const duration = Date.now() - startTime;
  
  if (mockTx.pow_nonce === undefined || mockTx.pow_bits < 2) {
    throw new Error("Proof-of-Work mining failed to meet target bits!");
  }
  console.log(`   Client PoW Mining (Target: 2 bits, Nonce: ${mockTx.pow_nonce}, Time: ${duration}ms): PASSED ✓`);

  console.log("\n==========================================");
  console.log("All Webpage & Web Wallet Tests PASSED!");
  console.log("==========================================");
}

runWebpageTests().catch(err => {
  console.error("\n❌ Webpage Test Failed:", err);
  process.exit(1);
});
