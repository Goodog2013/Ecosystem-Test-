const crypto = require("node:crypto");
const { ErrorCodes } = require("./errors");
const { ok, fail } = require("./result");
const { toCents, centsToString, feeWithMinimum, isPositiveCents } = require("./money");
const { dateKey, SystemTimeProvider } = require("./timeProvider");
const {
  AccountStatus,
  TransactionStatus,
  TransactionType,
  LoanStatus,
  DepositStatus,
  createDailyLimits,
  createEmptyState,
} = require("./entities");
const { StoreSystem } = require("./storeSystem");

class BankEngine {
  constructor({ state = null, timeProvider = null } = {}) {
    this.state = state || createEmptyState();
    this.timeProvider = timeProvider || new SystemTimeProvider();
    this.storeSystem = new StoreSystem(this.state, this.timeProvider);
  }

  createPlayer(name) {
    const trimmed = String(name || "").trim();
    if (!trimmed) {
      return fail(ErrorCodes.VALIDATION_ERROR, "Player name is required");
    }
    const id = this._id("plr");
    const player = { id, name: trimmed };
    this.state.players[id] = player;
    return ok(player);
  }

  createStore(storeId, name) {
    return this.storeSystem.registerStore(storeId, name);
  }

  createAccount(playerId) {
    const player = this.state.players[playerId];
    if (!player) {
      return fail(ErrorCodes.NOT_FOUND, "Player not found", { playerId });
    }

    const accountId = this._id("acc");
    const account = {
      id: accountId,
      ownerId: playerId,
      balanceCents: 0,
      currency: "MBR",
      status: AccountStatus.ACTIVE,
      dailyLimits: createDailyLimits(this._today()),
      overdraftAllowed: false,
    };
    this.state.accounts[accountId] = account;
    return ok(account);
  }

  getBalance(accountId) {
    const accountResult = this._getAccount(accountId);
    if (!accountResult.ok) {
      return accountResult;
    }
    const account = accountResult.value;
    return ok({
      accountId: account.id,
      currency: account.currency,
      balanceCents: account.balanceCents,
      balance: centsToString(account.balanceCents),
    });
  }

  depositCash(accountId, amount, meta = {}) {
    const amountResult = this._parsePositiveAmount(amount);
    if (!amountResult.ok) {
      return amountResult;
    }
    const amountCents = amountResult.value;

    const accountResult = this._getAccount(accountId);
    if (!accountResult.ok) {
      return accountResult;
    }
    const account = accountResult.value;

    const incomingCheck = this._ensureIncomingAllowed(account);
    if (!incomingCheck.ok) {
      this._recordTransaction({
        type: TransactionType.CASH_DEPOSIT,
        toAccountId: account.id,
        amountCents,
        status: TransactionStatus.REJECTED,
        metadata: { ...meta, reason: incomingCheck.error.message },
      });
      return incomingCheck;
    }

    account.balanceCents += amountCents;
    const tx = this._recordTransaction({
      type: TransactionType.CASH_DEPOSIT,
      toAccountId: account.id,
      amountCents,
      feeCents: 0,
      status: TransactionStatus.POSTED,
      metadata: { ...meta },
    });
    return ok(tx);
  }

  withdrawCash(accountId, amount, meta = {}) {
    const amountResult = this._parsePositiveAmount(amount);
    if (!amountResult.ok) {
      return amountResult;
    }
    const amountCents = amountResult.value;

    const accountResult = this._getAccount(accountId);
    if (!accountResult.ok) {
      return accountResult;
    }
    const account = accountResult.value;

    const outgoingCheck = this._ensureOutgoingAllowed(account);
    if (!outgoingCheck.ok) {
      this._recordTransaction({
        type: TransactionType.CASH_WITHDRAWAL,
        fromAccountId: account.id,
        amountCents,
        status: TransactionStatus.REJECTED,
        metadata: { ...meta, reason: outgoingCheck.error.message },
      });
      return outgoingCheck;
    }

    this._refreshDailyLimits(account);
    if (account.dailyLimits.withdrawalUsedCents + amountCents > account.dailyLimits.withdrawalLimitCents) {
      this._recordTransaction({
        type: TransactionType.CASH_WITHDRAWAL,
        fromAccountId: account.id,
        amountCents,
        status: TransactionStatus.REJECTED,
        metadata: { ...meta, reason: "Withdrawal daily limit exceeded" },
      });
      return fail(ErrorCodes.LIMIT_EXCEEDED, "Withdrawal daily limit exceeded");
    }

    const feeCents = feeWithMinimum(amountCents, 0.01, 200);
    const totalDebit = amountCents + feeCents;
    if (account.balanceCents < totalDebit) {
      this._recordTransaction({
        type: TransactionType.CASH_WITHDRAWAL,
        fromAccountId: account.id,
        amountCents,
        feeCents,
        status: TransactionStatus.REJECTED,
        metadata: { ...meta, reason: "Insufficient funds for withdrawal and fee" },
      });
      return fail(ErrorCodes.INSUFFICIENT_FUNDS, "Insufficient funds for withdrawal and fee");
    }

    account.balanceCents -= totalDebit;
    account.dailyLimits.withdrawalUsedCents += amountCents;

    const tx = this._recordTransaction({
      type: TransactionType.CASH_WITHDRAWAL,
      fromAccountId: account.id,
      amountCents,
      feeCents,
      status: TransactionStatus.POSTED,
      metadata: { ...meta },
    });
    return ok(tx);
  }

  transfer(fromAccountId, toAccountId, amount, meta = {}) {
    const amountResult = this._parsePositiveAmount(amount);
    if (!amountResult.ok) {
      return amountResult;
    }
    const amountCents = amountResult.value;

    if (fromAccountId === toAccountId) {
      return fail(ErrorCodes.VALIDATION_ERROR, "Source and target account must be different");
    }

    const fromResult = this._getAccount(fromAccountId);
    if (!fromResult.ok) {
      return fromResult;
    }
    const toResult = this._getAccount(toAccountId);
    if (!toResult.ok) {
      return toResult;
    }
    const fromAccount = fromResult.value;
    const toAccount = toResult.value;

    const outgoingCheck = this._ensureOutgoingAllowed(fromAccount);
    if (!outgoingCheck.ok) {
      this._recordTransaction({
        type: TransactionType.TRANSFER,
        fromAccountId,
        toAccountId,
        amountCents,
        status: TransactionStatus.REJECTED,
        metadata: { ...meta, reason: outgoingCheck.error.message },
      });
      return outgoingCheck;
    }

    const incomingCheck = this._ensureIncomingAllowed(toAccount);
    if (!incomingCheck.ok) {
      this._recordTransaction({
        type: TransactionType.TRANSFER,
        fromAccountId,
        toAccountId,
        amountCents,
        status: TransactionStatus.REJECTED,
        metadata: { ...meta, reason: incomingCheck.error.message },
      });
      return incomingCheck;
    }

    this._refreshDailyLimits(fromAccount);
    if (fromAccount.dailyLimits.transferUsedCents + amountCents > fromAccount.dailyLimits.transferLimitCents) {
      this._recordTransaction({
        type: TransactionType.TRANSFER,
        fromAccountId,
        toAccountId,
        amountCents,
        status: TransactionStatus.REJECTED,
        metadata: { ...meta, reason: "Transfer daily limit exceeded" },
      });
      return fail(ErrorCodes.LIMIT_EXCEEDED, "Transfer daily limit exceeded");
    }

    const feeCents = feeWithMinimum(amountCents, 0.005, 100);
    const totalDebit = amountCents + feeCents;
    if (fromAccount.balanceCents < totalDebit) {
      this._recordTransaction({
        type: TransactionType.TRANSFER,
        fromAccountId,
        toAccountId,
        amountCents,
        feeCents,
        status: TransactionStatus.REJECTED,
        metadata: { ...meta, reason: "Insufficient funds for transfer and fee" },
      });
      return fail(ErrorCodes.INSUFFICIENT_FUNDS, "Insufficient funds for transfer and fee");
    }

    fromAccount.balanceCents -= totalDebit;
    toAccount.balanceCents += amountCents;
    fromAccount.dailyLimits.transferUsedCents += amountCents;

    const tx = this._recordTransaction({
      type: TransactionType.TRANSFER,
      fromAccountId,
      toAccountId,
      amountCents,
      feeCents,
      status: TransactionStatus.POSTED,
      metadata: { ...meta },
    });
    return ok(tx);
  }

  payAtStore(accountId, storeId, amount, cartMeta = {}) {
    const amountResult = this._parsePositiveAmount(amount);
    if (!amountResult.ok) {
      return amountResult;
    }
    const amountCents = amountResult.value;

    const accountResult = this._getAccount(accountId);
    if (!accountResult.ok) {
      return accountResult;
    }
    const account = accountResult.value;

    const storeResult = this.storeSystem.getStore(storeId);
    if (!storeResult.ok) {
      return storeResult;
    }
    const store = storeResult.value;

    const outgoingCheck = this._ensureOutgoingAllowed(account);
    if (!outgoingCheck.ok) {
      this._recordTransaction({
        type: TransactionType.STORE_PAYMENT,
        fromAccountId: account.id,
        amountCents,
        status: TransactionStatus.REJECTED,
        metadata: { storeId, ...cartMeta, reason: outgoingCheck.error.message },
      });
      return outgoingCheck;
    }

    if (account.balanceCents < amountCents) {
      this._recordTransaction({
        type: TransactionType.STORE_PAYMENT,
        fromAccountId: account.id,
        amountCents,
        status: TransactionStatus.REJECTED,
        metadata: { storeId, ...cartMeta, reason: "Insufficient funds for purchase" },
      });
      return fail(ErrorCodes.INSUFFICIENT_FUNDS, "Insufficient funds for purchase");
    }

    account.balanceCents -= amountCents;
    store.cashCents += amountCents;
    const receipt = this.storeSystem.createReceipt(store.id, account.id, amountCents, cartMeta);

    this._recordTransaction({
      type: TransactionType.STORE_PAYMENT,
      fromAccountId: account.id,
      toAccountId: `store:${store.id}`,
      amountCents,
      feeCents: 0,
      status: TransactionStatus.POSTED,
      metadata: { storeId: store.id, receiptId: receipt.id, ...cartMeta },
    });
    return ok(receipt);
  }

  openLoan(accountId, principal, rateAPR, termDays) {
    const principalResult = this._parsePositiveAmount(principal);
    if (!principalResult.ok) {
      return principalResult;
    }
    const principalCents = principalResult.value;
    if (!Number.isFinite(Number(rateAPR)) || Number(rateAPR) < 0) {
      return fail(ErrorCodes.VALIDATION_ERROR, "rateAPR must be a non-negative number");
    }
    if (!Number.isInteger(termDays) || termDays <= 0) {
      return fail(ErrorCodes.VALIDATION_ERROR, "termDays must be a positive integer");
    }

    const accountResult = this._getAccount(accountId);
    if (!accountResult.ok) {
      return accountResult;
    }
    const account = accountResult.value;
    const incomingCheck = this._ensureIncomingAllowed(account);
    if (!incomingCheck.ok) {
      return incomingCheck;
    }

    const loan = {
      id: this._id("loan"),
      borrowerAccountId: account.id,
      principalCents,
      rateAPR: Number(rateAPR),
      termDays,
      remainingCents: principalCents,
      nextDueDate: this._addDays(this._today(), 1),
      status: LoanStatus.ACTIVE,
      daysPaid: 0,
    };
    this.state.loans[loan.id] = loan;
    account.balanceCents += principalCents;

    this._recordTransaction({
      type: TransactionType.LOAN_OPEN,
      toAccountId: account.id,
      amountCents: principalCents,
      feeCents: 0,
      status: TransactionStatus.POSTED,
      metadata: { loanId: loan.id, rateAPR: loan.rateAPR, termDays: loan.termDays },
    });
    return ok(loan);
  }

  repayLoan(accountId, loanId, amount) {
    const amountResult = this._parsePositiveAmount(amount);
    if (!amountResult.ok) {
      return amountResult;
    }
    let amountCents = amountResult.value;

    const accountResult = this._getAccount(accountId);
    if (!accountResult.ok) {
      return accountResult;
    }
    const account = accountResult.value;
    const outgoingCheck = this._ensureOutgoingAllowed(account);
    if (!outgoingCheck.ok) {
      return outgoingCheck;
    }

    const loan = this.state.loans[loanId];
    if (!loan) {
      return fail(ErrorCodes.NOT_FOUND, "Loan not found", { loanId });
    }
    if (loan.borrowerAccountId !== account.id) {
      return fail(ErrorCodes.VALIDATION_ERROR, "Loan does not belong to this account");
    }
    if (loan.status !== LoanStatus.ACTIVE) {
      return fail(ErrorCodes.INVALID_STATUS, "Loan is not active", { loanStatus: loan.status });
    }

    amountCents = Math.min(amountCents, loan.remainingCents);
    if (!isPositiveCents(amountCents)) {
      return fail(ErrorCodes.VALIDATION_ERROR, "Repayment amount must be positive");
    }
    if (account.balanceCents < amountCents) {
      return fail(ErrorCodes.INSUFFICIENT_FUNDS, "Insufficient funds to repay loan");
    }

    account.balanceCents -= amountCents;
    loan.remainingCents -= amountCents;
    if (loan.remainingCents <= 0) {
      loan.remainingCents = 0;
      loan.status = LoanStatus.CLOSED;
    }

    this._recordTransaction({
      type: TransactionType.LOAN_REPAYMENT,
      fromAccountId: account.id,
      amountCents,
      feeCents: 0,
      status: TransactionStatus.POSTED,
      metadata: { loanId: loan.id },
    });
    return ok(loan);
  }

  openDeposit(accountId, amount, rateAPR, termDays) {
    const amountResult = this._parsePositiveAmount(amount);
    if (!amountResult.ok) {
      return amountResult;
    }
    const amountCents = amountResult.value;
    if (!Number.isFinite(Number(rateAPR)) || Number(rateAPR) < 0) {
      return fail(ErrorCodes.VALIDATION_ERROR, "rateAPR must be a non-negative number");
    }
    if (!Number.isInteger(termDays) || termDays <= 0) {
      return fail(ErrorCodes.VALIDATION_ERROR, "termDays must be a positive integer");
    }

    const accountResult = this._getAccount(accountId);
    if (!accountResult.ok) {
      return accountResult;
    }
    const account = accountResult.value;
    const outgoingCheck = this._ensureOutgoingAllowed(account);
    if (!outgoingCheck.ok) {
      return outgoingCheck;
    }
    if (account.balanceCents < amountCents) {
      return fail(ErrorCodes.INSUFFICIENT_FUNDS, "Insufficient funds to open deposit");
    }

    account.balanceCents -= amountCents;
    const startDate = this._today();
    const deposit = {
      id: this._id("dep"),
      ownerAccountId: account.id,
      amountCents,
      rateAPR: Number(rateAPR),
      termDays,
      startDate,
      maturityDate: this._addDays(startDate, termDays),
      status: DepositStatus.ACTIVE,
      accruedInterestCents: 0,
    };
    this.state.deposits[deposit.id] = deposit;

    this._recordTransaction({
      type: TransactionType.DEPOSIT_OPEN,
      fromAccountId: account.id,
      amountCents,
      feeCents: 0,
      status: TransactionStatus.POSTED,
      metadata: { depositId: deposit.id, rateAPR: deposit.rateAPR, termDays: deposit.termDays },
    });
    return ok(deposit);
  }

  closeDeposit(accountId, depositId) {
    const accountResult = this._getAccount(accountId);
    if (!accountResult.ok) {
      return accountResult;
    }
    const account = accountResult.value;

    const deposit = this.state.deposits[depositId];
    if (!deposit) {
      return fail(ErrorCodes.NOT_FOUND, "Deposit not found", { depositId });
    }
    if (deposit.ownerAccountId !== account.id) {
      return fail(ErrorCodes.VALIDATION_ERROR, "Deposit does not belong to this account");
    }
    if (deposit.status !== DepositStatus.ACTIVE) {
      return fail(ErrorCodes.INVALID_STATUS, "Deposit is not active", { depositStatus: deposit.status });
    }

    const incomingCheck = this._ensureIncomingAllowed(account);
    if (!incomingCheck.ok) {
      return incomingCheck;
    }

    const isEarlyClose = this._today() < deposit.maturityDate;
    const payoutInterestCents = isEarlyClose
      ? Math.round(deposit.accruedInterestCents * 0.8)
      : deposit.accruedInterestCents;
    const penaltyCents = deposit.accruedInterestCents - payoutInterestCents;
    const payoutCents = deposit.amountCents + payoutInterestCents;

    account.balanceCents += payoutCents;
    deposit.status = DepositStatus.CLOSED;
    deposit.closedDate = this._today();
    deposit.payoutInterestCents = payoutInterestCents;
    deposit.penaltyCents = penaltyCents;

    this._recordTransaction({
      type: TransactionType.DEPOSIT_CLOSE,
      toAccountId: account.id,
      amountCents: payoutCents,
      feeCents: 0,
      status: TransactionStatus.POSTED,
      metadata: {
        depositId: deposit.id,
        earlyClose: isEarlyClose,
        penaltyCents,
      },
    });
    return ok({ deposit, payoutCents, penaltyCents });
  }

  endOfDayTick() {
    const today = this._today();
    if (this.state.lastEndOfDayDate === today) {
      return fail(ErrorCodes.ALREADY_PROCESSED, "endOfDayTick already processed for this date", {
        date: today,
      });
    }

    const summary = {
      date: today,
      processedDeposits: 0,
      maturedDeposits: 0,
      depositInterestCents: 0,
      processedLoans: 0,
      successfulLoanPayments: 0,
      failedLoanPayments: 0,
      loanInterestCents: 0,
    };

    for (const account of Object.values(this.state.accounts)) {
      account.dailyLimits.transferUsedCents = 0;
      account.dailyLimits.withdrawalUsedCents = 0;
      account.dailyLimits.lastResetDate = today;
    }

    for (const deposit of Object.values(this.state.deposits)) {
      if (deposit.status !== DepositStatus.ACTIVE) {
        continue;
      }
      summary.processedDeposits += 1;
      const dailyInterest = Math.round((deposit.amountCents * deposit.rateAPR) / 365);
      deposit.accruedInterestCents += dailyInterest;
      summary.depositInterestCents += dailyInterest;

      if (today >= deposit.maturityDate) {
        const owner = this.state.accounts[deposit.ownerAccountId];
        if (owner && owner.status !== AccountStatus.CLOSED) {
          const payoutCents = deposit.amountCents + deposit.accruedInterestCents;
          owner.balanceCents += payoutCents;
          deposit.status = DepositStatus.CLOSED;
          deposit.closedDate = today;
          deposit.payoutInterestCents = deposit.accruedInterestCents;
          deposit.penaltyCents = 0;
          summary.maturedDeposits += 1;
          this._recordTransaction({
            type: TransactionType.DEPOSIT_MATURITY,
            toAccountId: owner.id,
            amountCents: payoutCents,
            feeCents: 0,
            status: TransactionStatus.POSTED,
            metadata: { depositId: deposit.id },
          });
        }
      }
    }

    for (const loan of Object.values(this.state.loans)) {
      if (loan.status !== LoanStatus.ACTIVE) {
        continue;
      }
      if (today < loan.nextDueDate) {
        continue;
      }

      summary.processedLoans += 1;
      const loanInterest = Math.round((loan.remainingCents * loan.rateAPR) / 365);
      loan.remainingCents += loanInterest;
      summary.loanInterestCents += loanInterest;

      const daysLeft = Math.max(1, loan.termDays - loan.daysPaid);
      const scheduledPaymentCents = Math.max(1, Math.round(loan.remainingCents / daysLeft));
      const borrower = this.state.accounts[loan.borrowerAccountId];

      if (
        borrower &&
        borrower.status === AccountStatus.ACTIVE &&
        borrower.balanceCents >= scheduledPaymentCents
      ) {
        borrower.balanceCents -= scheduledPaymentCents;
        loan.remainingCents -= scheduledPaymentCents;
        summary.successfulLoanPayments += 1;
        this._recordTransaction({
          type: TransactionType.EOD_LOAN_PAYMENT,
          fromAccountId: borrower.id,
          amountCents: scheduledPaymentCents,
          feeCents: 0,
          status: TransactionStatus.POSTED,
          metadata: { loanId: loan.id, auto: true, interestAppliedCents: loanInterest },
        });
      } else {
        summary.failedLoanPayments += 1;
        this._recordTransaction({
          type: TransactionType.EOD_LOAN_PAYMENT,
          fromAccountId: borrower ? borrower.id : loan.borrowerAccountId,
          amountCents: scheduledPaymentCents,
          feeCents: 0,
          status: TransactionStatus.REJECTED,
          metadata: { loanId: loan.id, auto: true, reason: "Auto-payment failed" },
        });
      }

      loan.daysPaid += 1;
      loan.nextDueDate = this._addDays(loan.nextDueDate, 1);
      if (loan.remainingCents <= 0) {
        loan.remainingCents = 0;
        loan.status = LoanStatus.CLOSED;
      }
    }

    this.state.lastEndOfDayDate = today;
    return ok(summary);
  }

  listLastTransactions(limit = 20) {
    const count = Math.max(0, Number(limit) || 20);
    const items = this.state.transactions.slice(-count).reverse();
    return ok(items);
  }

  getStateSnapshot() {
    return JSON.parse(JSON.stringify(this.state));
  }

  _recordTransaction({
    type,
    fromAccountId = null,
    toAccountId = null,
    amountCents = 0,
    feeCents = 0,
    metadata = {},
    status = TransactionStatus.POSTED,
  }) {
    const tx = {
      id: this._id("tx"),
      type,
      fromAccountId,
      toAccountId,
      amountCents,
      feeCents,
      timestamp: this.timeProvider.now().toISOString(),
      metadata: { ...metadata },
      status,
    };
    this.state.transactions.push(tx);
    return tx;
  }

  _getAccount(accountId) {
    const account = this.state.accounts[accountId];
    if (!account) {
      return fail(ErrorCodes.NOT_FOUND, "Account not found", { accountId });
    }
    return ok(account);
  }

  _ensureIncomingAllowed(account) {
    if (account.status === AccountStatus.CLOSED) {
      return fail(ErrorCodes.ACCOUNT_CLOSED, "Account is closed");
    }
    return ok();
  }

  _ensureOutgoingAllowed(account) {
    if (account.status === AccountStatus.CLOSED) {
      return fail(ErrorCodes.ACCOUNT_CLOSED, "Account is closed");
    }
    if (account.status === AccountStatus.FROZEN) {
      return fail(ErrorCodes.ACCOUNT_FROZEN, "Account is frozen for outgoing operations");
    }
    return ok();
  }

  _parsePositiveAmount(amount) {
    let amountCents;
    try {
      amountCents = toCents(amount);
    } catch (err) {
      return fail(ErrorCodes.INVALID_AMOUNT, "Amount must be a valid number with up to 2 decimals");
    }
    if (!isPositiveCents(amountCents)) {
      return fail(ErrorCodes.INVALID_AMOUNT, "Amount must be positive");
    }
    return ok(amountCents);
  }

  _refreshDailyLimits(account) {
    const today = this._today();
    if (account.dailyLimits.lastResetDate !== today) {
      account.dailyLimits.transferUsedCents = 0;
      account.dailyLimits.withdrawalUsedCents = 0;
      account.dailyLimits.lastResetDate = today;
    }
  }

  _today() {
    return dateKey(this.timeProvider.now());
  }

  _addDays(dateString, days) {
    const base = new Date(`${dateString}T00:00:00.000Z`);
    base.setUTCDate(base.getUTCDate() + days);
    return dateKey(base);
  }

  _id(prefix) {
    return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
  }
}

module.exports = { BankEngine };

