const crypto = require("node:crypto");
const { ErrorCodes } = require("./errors");
const { ok, fail } = require("./result");

class StoreSystem {
  constructor(state, timeProvider) {
    this.state = state;
    this.timeProvider = timeProvider;
  }

  registerStore(storeId, name) {
    const id = String(storeId || "").trim();
    const storeName = String(name || "").trim();
    if (!id || !storeName) {
      return fail(ErrorCodes.VALIDATION_ERROR, "storeId and name are required");
    }
    if (this.state.stores[id]) {
      return fail(ErrorCodes.ALREADY_EXISTS, "Store already exists", { storeId: id });
    }
    const store = { id, name: storeName, cashCents: 0 };
    this.state.stores[id] = store;
    return ok(store);
  }

  getStore(storeId) {
    const store = this.state.stores[String(storeId || "").trim()];
    if (!store) {
      return fail(ErrorCodes.NOT_FOUND, "Store not found", { storeId });
    }
    return ok(store);
  }

  createReceipt(storeId, accountId, amountCents, cartMeta = {}) {
    const receipt = {
      id: `rcpt_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`,
      storeId,
      accountId,
      amountCents,
      timestamp: this.timeProvider.now().toISOString(),
      cartMeta: { ...cartMeta },
    };
    this.state.receipts.push(receipt);
    return receipt;
  }
}

module.exports = { StoreSystem };

