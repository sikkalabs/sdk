import { mineProofOfWork } from './crypto.js';

self.onmessage = async (e) => {
  const { id, transaction, minimumBits, options = {} } = e.data || {};
  try {
    const result = await mineProofOfWork(transaction, minimumBits, {
      ...options,
      onProgress: (progress) => {
        self.postMessage({ type: 'progress', id, progress });
      }
    });
    self.postMessage({ type: 'success', id, result, transaction });
  } catch (error) {
    self.postMessage({ type: 'error', id, error: error.message || String(error) });
  }
};
