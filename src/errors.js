export class SikkaError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SikkaError';
  }
}

export class InsufficientBalanceError extends SikkaError {
  constructor(required, available) {
    super(`Insufficient balance. Required: ${required.toString()} chillar, Available: ${available.toString()} chillar`);
    this.name = 'InsufficientBalanceError';
    this.required = required;
    this.available = available;
  }
}

export class InvalidAddressError extends SikkaError {
  constructor(address, reason = 'Invalid Bech32m checksum or format') {
    super(`Invalid Sikka address "${address}": ${reason}`);
    this.name = 'InvalidAddressError';
    this.address = address;
  }
}

export class InvalidMnemonicError extends SikkaError {
  constructor(reason = 'Invalid BIP-39 mnemonic phrase') {
    super(reason);
    this.name = 'InvalidMnemonicError';
  }
}

export class NetworkError extends SikkaError {
  constructor(message, statusCode, url) {
    super(message);
    this.name = 'NetworkError';
    this.statusCode = statusCode;
    this.url = url;
  }
}

export class PoWTimeoutError extends SikkaError {
  constructor(bits, attempts) {
    super(`Proof of work search cancelled or timed out after ${attempts} attempts for target ${bits} bits`);
    this.name = 'PoWTimeoutError';
    this.bits = bits;
    this.attempts = attempts;
  }
}
