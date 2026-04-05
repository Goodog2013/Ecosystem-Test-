const test = require("node:test");
const assert = require("node:assert/strict");
const { BankEngine } = require("../src/domain/bankEngine");
const { FixedTimeProvider } = require("../src/domain/timeProvider");
const { AccountStatus } = require("../src/domain/entities");

function createBase() {
  const clock = new FixedTimeProvider("2026-02-24T00:00:00.000Z");
  const engine = new BankEngine({ timeProvider: clock });
  const p1 = engine.createPlayer("A").value;
  const p2 = engine.createPlayer("B").value;
  const a1 = engine.createAccount(p1.id).value;
  const a2 = engine.createAccount(p2.id).value;
  engine.createStore("store_1", "Main");
  return { engine, clock, a1, a2 };
}

test("fees and rounding", () => {
  const { engine, a1, a2 } = createBase();
  assert.equal(engine.depositCash(a1.id, 1000, {}).ok, true);

  const withdraw = engine.withdrawCash(a1.id, 100, {});
  assert.equal(withdraw.ok, true);
  // 100 + min fee 2 = 102
  assert.equal(engine.state.accounts[a1.id].balanceCents, 89_800);

  const transfer = engine.transfer(a1.id, a2.id, "333.33", {});
  assert.equal(transfer.ok, true);
  // fee: 0.5% from 333.33 => 1.67
  assert.equal(transfer.value.feeCents, 167);
  assert.equal(engine.state.accounts[a1.id].balanceCents, 56_300);
  assert.equal(engine.state.accounts[a2.id].balanceCents, 33_333);
});

test("daily limits", () => {
  const { engine, a1, a2 } = createBase();
  engine.depositCash(a1.id, 10_000, {});

  const t1 = engine.transfer(a1.id, a2.id, 4_000, {});
  assert.equal(t1.ok, true);

  const t2 = engine.transfer(a1.id, a2.id, 1_200, {});
  assert.equal(t2.ok, false);
  assert.equal(t2.error.code, "LIMIT_EXCEEDED");
});

test("frozen and closed status restrictions", () => {
  const { engine, a1 } = createBase();
  engine.depositCash(a1.id, 100, {});

  engine.state.accounts[a1.id].status = AccountStatus.FROZEN;
  const withdrawFrozen = engine.withdrawCash(a1.id, 10, {});
  assert.equal(withdrawFrozen.ok, false);
  assert.equal(withdrawFrozen.error.code, "ACCOUNT_FROZEN");

  const depositFrozen = engine.depositCash(a1.id, 10, {});
  assert.equal(depositFrozen.ok, true);

  engine.state.accounts[a1.id].status = AccountStatus.CLOSED;
  const depositClosed = engine.depositCash(a1.id, 10, {});
  assert.equal(depositClosed.ok, false);
  assert.equal(depositClosed.error.code, "ACCOUNT_CLOSED");
});

test("transfer and store payment", () => {
  const { engine, a1, a2 } = createBase();
  engine.depositCash(a1.id, 200, {});

  const transfer = engine.transfer(a1.id, a2.id, 100, {});
  assert.equal(transfer.ok, true);

  const pay = engine.payAtStore(a2.id, "store_1", 40, { items: 2 });
  assert.equal(pay.ok, true);
  assert.equal(engine.state.stores.store_1.cashCents, 4_000);
  assert.equal(engine.state.accounts[a2.id].balanceCents, 6_000);
});

test("endOfDayTick applies deposit interest and loan auto payment", () => {
  const { engine, clock, a1 } = createBase();
  engine.depositCash(a1.id, 500, {});
  const dep = engine.openDeposit(a1.id, 100, 0.365, 10);
  assert.equal(dep.ok, true);
  const loan = engine.openLoan(a1.id, 200, 0.365, 10);
  assert.equal(loan.ok, true);

  const beforeLoan = engine.state.loans[loan.value.id].remainingCents;
  const beforeBalance = engine.state.accounts[a1.id].balanceCents;

  clock.advanceDays(1);
  const eod = engine.endOfDayTick();
  assert.equal(eod.ok, true);
  assert.equal(eod.value.processedDeposits, 1);
  assert.equal(eod.value.processedLoans, 1);

  const afterDeposit = engine.state.deposits[dep.value.id];
  const afterLoan = engine.state.loans[loan.value.id];
  const afterBalance = engine.state.accounts[a1.id].balanceCents;

  assert.ok(afterDeposit.accruedInterestCents > 0);
  assert.ok(afterLoan.remainingCents < beforeLoan);
  assert.ok(afterBalance < beforeBalance);
});

