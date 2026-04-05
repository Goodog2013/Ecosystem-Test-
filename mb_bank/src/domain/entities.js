const AccountStatus = Object.freeze({
  ACTIVE: "Active",
  FROZEN: "Frozen",
  CLOSED: "Closed",
});

const TransactionStatus = Object.freeze({
  PENDING: "Pending",
  POSTED: "Posted",
  REJECTED: "Rejected",
});

const TransactionType = Object.freeze({
  CASH_DEPOSIT: "CashDeposit",
  CASH_WITHDRAWAL: "CashWithdrawal",
  TRANSFER: "Transfer",
  STORE_PAYMENT: "StorePayment",
  LOAN_OPEN: "LoanOpen",
  LOAN_REPAYMENT: "LoanRepayment",
  EOD_LOAN_PAYMENT: "EodLoanPayment",
  DEPOSIT_OPEN: "DepositOpen",
  DEPOSIT_CLOSE: "DepositClose",
  DEPOSIT_MATURITY: "DepositMaturity",
});

const LoanStatus = Object.freeze({
  ACTIVE: "Active",
  CLOSED: "Closed",
});

const DepositStatus = Object.freeze({
  ACTIVE: "Active",
  CLOSED: "Closed",
});

function createDailyLimits(today) {
  return {
    transferLimitCents: 500_000,
    withdrawalLimitCents: 200_000,
    transferUsedCents: 0,
    withdrawalUsedCents: 0,
    lastResetDate: today,
  };
}

function createEmptyState() {
  return {
    players: {},
    accounts: {},
    transactions: [],
    loans: {},
    deposits: {},
    stores: {},
    receipts: [],
    lastEndOfDayDate: null,
  };
}

module.exports = {
  AccountStatus,
  TransactionStatus,
  TransactionType,
  LoanStatus,
  DepositStatus,
  createDailyLimits,
  createEmptyState,
};

