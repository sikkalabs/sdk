export const NODE_HTTP_TIMEOUT = 10000;
export const NODE_MAX_ATTEMPTS = 3;
export const NODE_RETRY_DELAY = 500;

export async function fetchFromNode(method, url, bodyContent) {
  let lastError;
  for (let attempt = 1; attempt <= NODE_MAX_ATTEMPTS; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), NODE_HTTP_TIMEOUT);
      
      const options = {
        method,
        headers: bodyContent ? { 'Content-Type': 'application/json' } : {},
        body: bodyContent ? JSON.stringify(bodyContent) : undefined,
        signal: controller.signal
      };

      const response = await fetch(url, options);
      clearTimeout(timeoutId);

      if (response.status < 500 || attempt === NODE_MAX_ATTEMPTS) {
        return response;
      }
      
      lastError = new Error(`Node returned status ${response.status}`);
      await response.arrayBuffer();
    } catch (err) {
      lastError = err;
    }
    
    if (attempt < NODE_MAX_ATTEMPTS) {
      await new Promise(resolve => setTimeout(resolve, attempt * NODE_RETRY_DELAY));
    }
  }
  throw new Error(`${method} ${url} failed after ${NODE_MAX_ATTEMPTS} attempts: ${lastError.message || lastError}`);
}

export class APIClient {
  constructor(nodeURL) {
    this.nodeURL = nodeURL.replace(/\/$/, '');
  }

  async getAddressInfo(address) {
    const url = `${this.nodeURL}/v1/address/${address}?limit=500`;
    const response = await fetchFromNode('GET', url);
    if (response.status !== 200) {
      const errorMessage = await response.text();
      throw new Error(`Failed to get address info (${response.status}): ${errorMessage}`);
    }
    
    const responseEnvelope = await response.json();
    const addressInfo = {
      address: responseEnvelope.meta.address,
      balance: responseEnvelope.meta.balance,
      utxo_count: responseEnvelope.meta.utxo_count,
      unspentOutputs: responseEnvelope.items || []
    };
    
    if (addressInfo.address && addressInfo.address !== address) {
      throw new Error(`Address response mismatch. Expected ${address}, got ${addressInfo.address}`);
    }
    
    return addressInfo;
  }

  async getNodeStatus() {
    const url = `${this.nodeURL}/v1/status`;
    const response = await fetchFromNode('GET', url);
    if (response.status !== 200) {
      const errorMessage = await response.text();
      throw new Error(`Failed to get node status (${response.status}): ${errorMessage}`);
    }
    
    const status = await response.json();
    if (!status.tips || status.tips.length < 1) {
      throw new Error("Node status returned no tips (empty DAG)");
    }
    
    let dagSize = 0;
    for (const key of ["dag_size", "dagSize", "dag_depth", "dagDepth", "height", "best_height", "bestHeight"]) {
      if (status[key] !== undefined) {
        const parsed = parseInt(status[key], 10);
        if (!isNaN(parsed)) {
          dagSize = parsed;
          break;
        }
      }
    }
    status.dagSize = dagSize;
    return status;
  }

  async getDagTips() {
    const url = `${this.nodeURL}/v1/dag/tips`;
    const response = await fetchFromNode('GET', url);
    if (response.status !== 200) {
      const errorMessage = await response.text();
      throw new Error(`Failed to get DAG tips (${response.status}): ${errorMessage}`);
    }
    return await response.json();
  }

  async getLatestTransactionTips() {
    try {
      const tipsData = await this.getDagTips();
      if (tipsData.tips && tipsData.tips.length > 0) {
        if (tipsData.tips.length === 1) {
          return [tipsData.tips[0], tipsData.tips[0]];
        }
        return tipsData.tips.slice(0, 2);
      }
    } catch (_) {
      // Fall back to /v1/status if /v1/dag/tips endpoint is not available
    }

    const status = await this.getNodeStatus();
    if (!status.tips || status.tips.length < 1) {
      throw new Error("Node status returned no tips (empty DAG)");
    }
    if (status.tips.length === 1) {
      return [status.tips[0], status.tips[0]];
    }
    return status.tips.slice(0, 2);
  }

  async getPeers() {
    const url = `${this.nodeURL}/v1/peers`;
    const response = await fetchFromNode('GET', url);
    if (response.status !== 200) {
      const errorMessage = await response.text();
      throw new Error(`Failed to get peers telemetry (${response.status}): ${errorMessage}`);
    }
    return await response.json();
  }

  async getAddressHistory(address, options = {}) {
    const limit = options.limit || 50;
    let url = `${this.nodeURL}/v1/address/${address}/history?limit=${limit}`;
    if (options.before) {
      url += `&before=${encodeURIComponent(options.before)}`;
    }
    const response = await fetchFromNode('GET', url);
    if (response.status !== 200) {
      const errorMessage = await response.text();
      throw new Error(`Failed to get address history (${response.status}): ${errorMessage}`);
    }
    return await response.json();
  }

  async getProofOfWorkQuote(transaction) {
    const url = `${this.nodeURL}/v1/tx/pow-quote`;
    const requestBody = { parents: transaction.parents, timestamp: transaction.timestamp };
    
    const response = await fetchFromNode('POST', url, requestBody);
    if (response.status !== 200) {
      const errorMessage = await response.text();
      throw new Error(`Failed to get PoW quote (${response.status}): ${errorMessage}`);
    }
    
    const quote = await response.json();
    if (quote.required_bits < 0) {
      throw new Error(`Invalid PoW quote from node: required_bits=${quote.required_bits}`);
    }
    if (!quote.parent_pow_hashes || quote.parent_pow_hashes.length !== 2) {
      throw new Error("PoW quote missing or invalid parent_pow_hashes");
    }
    
    return quote;
  }

  async submitTransaction(transaction) {
    const url = `${this.nodeURL}/v1/tx/submit`;
    const response = await fetchFromNode('POST', url, transaction);
    const textResponse = await response.text();
    
    if (response.status !== 200) {
      throw new Error(`Failed to submit transaction (${response.status}): ${textResponse}`);
    }
    
    const parsedResponse = JSON.parse(textResponse);
    return parsedResponse.txid;
  }

  async getTransaction(txid) {
    const url = `${this.nodeURL}/v1/tx/${txid}`;
    const response = await fetchFromNode('GET', url);
    if (response.status !== 200) {
      const errorMessage = await response.text();
      throw new Error(`Failed to get transaction ${txid} (${response.status}): ${errorMessage}`);
    }
    return await response.json();
  }

  async getTransactionWeight(txid) {
    const url = `${this.nodeURL}/v1/tx/${txid}/weight`;
    const response = await fetchFromNode('GET', url);
    if (response.status !== 200) {
      const errorMessage = await response.text();
      throw new Error(`Failed to get transaction weight ${txid} (${response.status}): ${errorMessage}`);
    }
    return await response.json();
  }

  async getTransactions(txids) {
    const url = `${this.nodeURL}/v1/txs`;
    const response = await fetchFromNode('POST', url, { txids });
    if (response.status !== 200) {
      const errorMessage = await response.text();
      throw new Error(`Failed to batch fetch transactions (${response.status}): ${errorMessage}`);
    }
    return await response.json();
  }

  async getSyncTail(addresses = [], limit = 50) {
    let url = `${this.nodeURL}/v1/sync/tail?limit=${limit}`;
    if (addresses) {
      const list = Array.isArray(addresses) ? addresses : [addresses];
      for (const addr of list) {
        if (addr) {
          url += `&addresses=${encodeURIComponent(addr)}`;
        }
      }
    }
    const response = await fetchFromNode('GET', url);
    if (response.status !== 200) {
      const errorMessage = await response.text();
      throw new Error(`Failed to fetch sync tail (${response.status}): ${errorMessage}`);
    }
    return await response.json();
  }
}
