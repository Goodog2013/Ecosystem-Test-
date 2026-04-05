const fs = require("node:fs/promises");
const path = require("node:path");
const { ErrorCodes } = require("../domain/errors");
const { ok, fail } = require("../domain/result");
const { createDailyLimits, createEmptyState } = require("../domain/entities");

class JsonSaveRepository {
  constructor() {
    this.currentSchemaVersion = 2;
  }

  async load(slotPath) {
    try {
      const content = await fs.readFile(slotPath, "utf8");
      const raw = JSON.parse(this._stripBom(content));
      const migrated = this._migrateIfNeeded(raw);
      const state = this._normalizeState(migrated);
      return ok(state);
    } catch (err) {
      if (err.code === "ENOENT") {
        return ok(createEmptyState());
      }
      return fail(ErrorCodes.SCHEMA_ERROR, "Failed to load save file", { message: err.message });
    }
  }

  async save(slotPath, state) {
    try {
      await fs.mkdir(path.dirname(slotPath), { recursive: true });
      const payload = {
        schemaVersion: this.currentSchemaVersion,
        ...state,
      };
      await fs.writeFile(slotPath, JSON.stringify(payload, null, 2), "utf8");
      return ok({ slotPath });
    } catch (err) {
      return fail(ErrorCodes.SCHEMA_ERROR, "Failed to save file", { message: err.message });
    }
  }

  _migrateIfNeeded(raw) {
    if (!raw || typeof raw !== "object") {
      return { schemaVersion: this.currentSchemaVersion, ...createEmptyState() };
    }

    const schemaVersion = Number(raw.schemaVersion || 1);
    if (schemaVersion === this.currentSchemaVersion) {
      return raw;
    }
    if (schemaVersion === 1) {
      return this._migrateV1ToV2(raw);
    }
    throw new Error(`Unsupported schema version: ${schemaVersion}`);
  }

  _migrateV1ToV2(raw) {
    const migrated = JSON.parse(JSON.stringify(raw));
    migrated.schemaVersion = 2;

    const today = new Date().toISOString().slice(0, 10);
    const accounts = migrated.accounts || {};
    const accountValues = Array.isArray(accounts) ? accounts : Object.values(accounts);
    for (const account of accountValues) {
      if (!account.dailyLimits) {
        account.dailyLimits = createDailyLimits(today);
      } else {
        account.dailyLimits.transferLimitCents ??= 500_000;
        account.dailyLimits.withdrawalLimitCents ??= 200_000;
        account.dailyLimits.transferUsedCents ??= 0;
        account.dailyLimits.withdrawalUsedCents ??= 0;
        account.dailyLimits.lastResetDate ??= today;
      }
    }
    return migrated;
  }

  _normalizeState(raw) {
    const base = createEmptyState();
    const players = raw.players || {};
    const accounts = raw.accounts || {};
    const loans = raw.loans || {};
    const deposits = raw.deposits || {};
    const stores = raw.stores || {};
    const transactions = Array.isArray(raw.transactions) ? raw.transactions : [];
    const receipts = Array.isArray(raw.receipts) ? raw.receipts : [];

    base.players = this._toMap(players);
    base.accounts = this._toMap(accounts);
    base.loans = this._toMap(loans);
    base.deposits = this._toMap(deposits);
    base.stores = this._toMap(stores);
    base.transactions = transactions;
    base.receipts = receipts;
    base.lastEndOfDayDate = raw.lastEndOfDayDate || null;

    const today = new Date().toISOString().slice(0, 10);
    for (const account of Object.values(base.accounts)) {
      account.balanceCents = Number(account.balanceCents || 0);
      account.currency ||= "MBR";
      account.status ||= "Active";
      account.dailyLimits ||= createDailyLimits(today);
      account.dailyLimits.transferLimitCents = Number(account.dailyLimits.transferLimitCents || 500_000);
      account.dailyLimits.withdrawalLimitCents = Number(
        account.dailyLimits.withdrawalLimitCents || 200_000,
      );
      account.dailyLimits.transferUsedCents = Number(account.dailyLimits.transferUsedCents || 0);
      account.dailyLimits.withdrawalUsedCents = Number(account.dailyLimits.withdrawalUsedCents || 0);
      account.dailyLimits.lastResetDate ||= today;
      account.overdraftAllowed = Boolean(account.overdraftAllowed);
    }

    for (const loan of Object.values(base.loans)) {
      loan.principalCents = Number(loan.principalCents || 0);
      loan.remainingCents = Number(loan.remainingCents || 0);
      loan.rateAPR = Number(loan.rateAPR || 0);
      loan.termDays = Number(loan.termDays || 0);
      loan.daysPaid = Number(loan.daysPaid || 0);
      loan.status ||= "Active";
    }

    for (const deposit of Object.values(base.deposits)) {
      deposit.amountCents = Number(deposit.amountCents || 0);
      deposit.accruedInterestCents = Number(deposit.accruedInterestCents || 0);
      deposit.rateAPR = Number(deposit.rateAPR || 0);
      deposit.termDays = Number(deposit.termDays || 0);
      deposit.status ||= "Active";
    }

    for (const store of Object.values(base.stores)) {
      store.cashCents = Number(store.cashCents || 0);
    }

    for (const tx of base.transactions) {
      tx.amountCents = Number(tx.amountCents || 0);
      tx.feeCents = Number(tx.feeCents || 0);
      tx.metadata ||= {};
      tx.status ||= "Posted";
    }

    for (const receipt of base.receipts) {
      receipt.amountCents = Number(receipt.amountCents || 0);
      receipt.cartMeta ||= {};
    }

    return base;
  }

  _toMap(input) {
    if (!input) {
      return {};
    }
    if (!Array.isArray(input)) {
      return { ...input };
    }
    const map = {};
    for (const item of input) {
      if (item && item.id) {
        map[item.id] = item;
      }
    }
    return map;
  }

  _stripBom(text) {
    return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  }
}

module.exports = { JsonSaveRepository };

