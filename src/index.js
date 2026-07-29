export { SikkaClient, APIClient } from './api.js';
export { PrivateKeyWallet } from './wallet.js';
export { HDWallet } from './hdwallet.js';

export {
  generateMnemonic,
  validateMnemonic,
  normalizeMnemonic,
  seedFromMnemonic,
  mnemonicToSeedSync,
} from './bip39.js';

export {
  encodeBech32m,
  decodeBech32m,
  validateAddress,
  isValidAddress,
} from './bech32m.js';

export {
  sikkaToChillar,
  chillarToSikka,
  toChillar,
  toSikka,
  fromChillar,
  fromSikka,
  SUBUNITS_PER_SIKKA,
  CHILLAR_PER_SIKKA,
} from './units.js';

export {
  selectUTXOs,
  hexToBytes,
  bytesToHex,
  stringToBytes,
  concatBytes,
} from './utils.js';

export {
  deriveMldsa87PublicKey,
  deriveMldsa87KeyPair,
  signMldsa87,
  verifyMldsa87,
  deriveAddressFromSeed,
  derivePathSeed,
  computeTransactionIdBytes,
  computeTxPowHash,
  mineProofOfWork,
  generateSigningPayload,
  signTransactionInput,
  SIGNING_DOMAIN,
  MLDSA87_PUBLIC_KEY_BYTES,
  MLDSA87_SECRET_KEY_BYTES,
  MLDSA87_SIGNATURE_BYTES,
  MLDSA87_SEED_BYTES,
  // Deprecated backwards-compat aliases. New code should call the ML-DSA helpers above.
  deriveFalcon1024PublicKey,
  signFalcon1024,
} from './crypto.js';

export {
  SikkaError,
  InsufficientBalanceError,
  InvalidAddressError,
  InvalidMnemonicError,
  NetworkError,
  PoWTimeoutError,
} from './errors.js';
