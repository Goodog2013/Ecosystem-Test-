const { BankEngine } = require("./src/domain/bankEngine");
const { FixedTimeProvider } = require("./src/domain/timeProvider");
const { centsToString } = require("./src/domain/money");

function showBalance(engine, accountId, title) {
  const balanceResult = engine.getBalance(accountId);
  if (balanceResult.ok) {
    console.log(`${title}: ${balanceResult.value.balance} MBR`);
  } else {
    console.log(`${title}: error ${balanceResult.error.code}`);
  }
}

function main() {
  const clock = new FixedTimeProvider("2026-02-24T10:00:00.000Z");
  const engine = new BankEngine({ timeProvider: clock });

  const player = engine.createPlayer("DemoPlayer").value;
  const account = engine.createAccount(player.id).value;
  engine.createStore("store_demo", "Demo Store");

  console.log("1) Create account:", account.id);
  console.log("2) Deposit 1000 MBR:", engine.depositCash(account.id, 1000, { source: "scenario" }).ok);
  showBalance(engine, account.id, "Balance after deposit");

  const payResult = engine.payAtStore(account.id, "store_demo", 125.5, {
    cart: [{ item: "Toy", qty: 1, priceMBR: 125.5 }],
  });
  console.log("3) Pay at store 125.50 MBR:", payResult.ok ? `receipt=${payResult.value.id}` : payResult.error);
  showBalance(engine, account.id, "Balance after purchase");

  const loanResult = engine.openLoan(account.id, 300, 0.24, 30);
  console.log("4) Open loan 300 MBR:", loanResult.ok ? loanResult.value.id : loanResult.error);

  const depositResult = engine.openDeposit(account.id, 200, 0.1, 10);
  console.log("5) Open deposit 200 MBR:", depositResult.ok ? depositResult.value.id : depositResult.error);
  showBalance(engine, account.id, "Balance before endOfDayTick");

  clock.advanceDays(1);
  const eodResult = engine.endOfDayTick();
  console.log("6) endOfDayTick:", eodResult.ok ? eodResult.value : eodResult.error);
  showBalance(engine, account.id, "Balance after endOfDayTick");

  const lastTx = engine.listLastTransactions(5).value;
  console.log("7) Last 5 transactions:");
  for (const tx of lastTx) {
    console.log(
      `- ${tx.type} ${tx.status} amount=${centsToString(tx.amountCents)} fee=${centsToString(tx.feeCents)}`,
    );
  }
}

if (require.main === module) {
  main();
}

