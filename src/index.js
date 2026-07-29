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
  deriveFalcon1024PublicKey,
  signFalcon1024,
  deriveAddressFromSeed,
  derivePathSeed,
  computeTransactionIdBytes,
  computeTxPowHash,
  mineProofOfWork,
  generateSigningPayload,
  signTransactionInput,
} from './crypto.js';

export {
  SikkaError,
  InsufficientBalanceError,
  InvalidAddressError,
  InvalidMnemonicError,
  NetworkError,
  PoWTimeoutError,
} from './errors.js';
