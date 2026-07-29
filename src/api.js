import { NetworkError } from './errors.js';

export class SikkaClient {
  constructor({ nodeURL = 'http://127.0.0.1:64552', timeout = 10000 } = {}) {
    this.nodeURL = nodeURL.replace(/\/+$/, '');
    this.timeout = timeout;
  }

  async request(endpoint, options = {}) {
    const url = `${this.nodeURL}${endpoint}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout);

    try {
      const res = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      const contentType = res.headers.get('content-type') || '';
      let body;
      if (contentType.includes('application/json')) {
        body = await res.json();
      } else {
        body = await res.text();
      }

      if (!res.ok) {
        const errorDetails = typeof body === 'object' ? (body.error || body.message || JSON.stringify(body)) : (body || `HTTP ${res.status}: ${res.statusText}`);
        throw new NetworkError(errorDetails, res.status, url);
      }

      return body;
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new NetworkError(`Request timed out after ${this.timeout}ms`, 408, url);
      }
      if (err instanceof NetworkError) throw err;
      throw new NetworkError(err.message, 0, url);
    } finally {
      clearTimeout(timer);
    }
  }

  // System & Health
  async getHealth() {
    return await this.request('/healthz');
  }

  async getNodeStatus() {
    return await this.request('/v1/status');
  }

  // Transactions & Mining
  async getPowQuote(parents = []) {
    return await this.request('/v1/tx/pow-quote', {
      method: 'POST',
      body: JSON.stringify({ parents, timestamp: Math.floor(Date.now() / 1000) }),
    });
  }

  async submitTransaction(transaction) {
    return await this.request('/v1/tx/submit', {
      method: 'POST',
      body: JSON.stringify(transaction),
    });
  }

  async getTransaction(txId) {
    return await this.request(`/v1/tx/${encodeURIComponent(txId)}`);
  }

  // UTXOs & History
  async getUTXOs(address) {
    return await this.request(`/v1/utxo/${encodeURIComponent(address)}`);
  }

  async getAddressHistory(address) {
    return await this.request(`/v1/history/${encodeURIComponent(address)}`);
  }

  async getLatestSnapshot() {
    return await this.request('/v1/snapshot/latest');
  }

  // Discovery & Nodes
  async getDiscoveryNodes() {
    return await this.request('/v1/discovery/nodes');
  }

  async announceNode(address) {
    return await this.request('/v1/discovery/announce', {
      method: 'POST',
      body: JSON.stringify({ address }),
    });
  }

  async registerNode(address) {
    return await this.request('/v1/nodes/register', {
      method: 'POST',
      body: JSON.stringify({ address }),
    });
  }

  async getPeers() {
    return await this.request('/v1/p2p/peers');
  }

  async addPeer(address) {
    return await this.request('/v1/p2p/peers', {
      method: 'POST',
      body: JSON.stringify({ address }),
    });
  }

  // Model Context Protocol (MCP) API
  async callMcp(method, params = {}) {
    return await this.request('/v1/mcp', {
      method: 'POST',
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method,
        params,
      }),
    });
  }
}

export const APIClient = SikkaClient;
