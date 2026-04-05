const path = require("node:path");
const readline = require("node:readline/promises");
const { stdin, stdout } = require("node:process");
const { BankEngine } = require("../domain/bankEngine");
const { JsonSaveRepository } = require("../storage/jsonSaveRepository");
const { centsToString } = require("../domain/money");

const SAVE_PATH = path.resolve(__dirname, "../../saves/slot1.json");

async function main() {
  const repository = new JsonSaveRepository();
  const loadResult = await repository.load(SAVE_PATH);
  if (!loadResult.ok) {
    console.error("Load error:", loadResult.error);
    process.exit(1);
  }

  const engine = new BankEngine({ state: loadResult.value });
  if (Object.keys(engine.state.players).length === 0) {
    const p1 = engine.createPlayer("Alice").value;
    const p2 = engine.createPlayer("Bob").value;
    engine.createAccount(p1.id);
    engine.createAccount(p2.id);
  }
  if (Object.keys(engine.state.stores).length === 0) {
    engine.createStore("store_main", "Main Store");
  }

  const rl = readline.createInterface({ input: stdin, output: stdout });
  console.log("MB Bank Console UI");

  let running = true;
  while (running) {
    printMenu();
    const choice = (await rl.question("> ")).trim();
    switch (choice) {
      case "1":
        await createAccountFlow(rl, engine);
        break;
      case "2":
        await showBalanceFlow(rl, engine);
        break;
      case "3":
        await depositFlow(rl, engine);
        break;
      case "4":
        await withdrawFlow(rl, engine);
        break;
      case "5":
        await transferFlow(rl, engine);
        break;
      case "6":
        await storePayFlow(rl, engine);
        break;
      case "7":
        await openLoanFlow(rl, engine);
        break;
      case "8":
        await repayLoanFlow(rl, engine);
        break;
      case "9":
        await openDepositFlow(rl, engine);
        break;
      case "10":
        await closeDepositFlow(rl, engine);
        break;
      case "11":
        printLastTransactions(engine);
        break;
      case "12":
        printResult(engine.endOfDayTick());
        break;
      case "13":
        await saveState(repository, engine);
        break;
      case "0":
        await saveState(repository, engine);
        running = false;
        break;
      default:
        console.log("Unknown command");
    }
  }

  rl.close();
}

function printMenu() {
  console.log("");
  console.log("1) Open account");
  console.log("2) Show balance");
  console.log("3) Deposit cash");
  console.log("4) Withdraw cash");
  console.log("5) Transfer");
  console.log("6) Pay at store");
  console.log("7) Open loan");
  console.log("8) Repay loan");
  console.log("9) Open deposit");
  console.log("10) Close deposit");
  console.log("11) Show last 20 transactions");
  console.log("12) endOfDayTick");
  console.log("13) Save");
  console.log("0) Exit");
}

async function createAccountFlow(rl, engine) {
  const playerName = (await rl.question("Player name: ")).trim();
  const playerResult = engine.createPlayer(playerName);
  if (!playerResult.ok) {
    printResult(playerResult);
    return;
  }
  const accountResult = engine.createAccount(playerResult.value.id);
  printResult(accountResult);
}

async function showBalanceFlow(rl, engine) {
  const accountId = (await rl.question("Account ID: ")).trim();
  const result = engine.getBalance(accountId);
  printResult(result);
}

async function depositFlow(rl, engine) {
  const accountId = (await rl.question("Account ID: ")).trim();
  const amount = (await rl.question("Amount MBR: ")).trim();
  printResult(engine.depositCash(accountId, amount, { source: "console" }));
}

async function withdrawFlow(rl, engine) {
  const accountId = (await rl.question("Account ID: ")).trim();
  const amount = (await rl.question("Amount MBR: ")).trim();
  printResult(engine.withdrawCash(accountId, amount, { source: "console" }));
}

async function transferFlow(rl, engine) {
  const fromAccountId = (await rl.question("From account ID: ")).trim();
  const toAccountId = (await rl.question("To account ID: ")).trim();
  const amount = (await rl.question("Amount MBR: ")).trim();
  printResult(engine.transfer(fromAccountId, toAccountId, amount, { source: "console" }));
}

async function storePayFlow(rl, engine) {
  const accountId = (await rl.question("Account ID: ")).trim();
  const storeId = (await rl.question("Store ID: ")).trim();
  const amount = (await rl.question("Amount MBR: ")).trim();
  printResult(engine.payAtStore(accountId, storeId, amount, { source: "console-pos" }));
}

async function openLoanFlow(rl, engine) {
  const accountId = (await rl.question("Account ID: ")).trim();
  const principal = (await rl.question("Principal MBR: ")).trim();
  const rateAPR = Number((await rl.question("APR (e.g. 0.24): ")).trim());
  const termDays = Number((await rl.question("Term days: ")).trim());
  printResult(engine.openLoan(accountId, principal, rateAPR, termDays));
}

async function repayLoanFlow(rl, engine) {
  const accountId = (await rl.question("Account ID: ")).trim();
  const loanId = (await rl.question("Loan ID: ")).trim();
  const amount = (await rl.question("Repay amount MBR: ")).trim();
  printResult(engine.repayLoan(accountId, loanId, amount));
}

async function openDepositFlow(rl, engine) {
  const accountId = (await rl.question("Account ID: ")).trim();
  const amount = (await rl.question("Amount MBR: ")).trim();
  const rateAPR = Number((await rl.question("APR (e.g. 0.12): ")).trim());
  const termDays = Number((await rl.question("Term days: ")).trim());
  printResult(engine.openDeposit(accountId, amount, rateAPR, termDays));
}

async function closeDepositFlow(rl, engine) {
  const accountId = (await rl.question("Account ID: ")).trim();
  const depositId = (await rl.question("Deposit ID: ")).trim();
  printResult(engine.closeDeposit(accountId, depositId));
}

function printLastTransactions(engine) {
  const result = engine.listLastTransactions(20);
  if (!result.ok) {
    printResult(result);
    return;
  }
  for (const tx of result.value) {
    console.log(
      `${tx.timestamp} | ${tx.type} | status=${tx.status} | amount=${centsToString(tx.amountCents)} | fee=${centsToString(
        tx.feeCents,
      )}`,
    );
  }
}

async function saveState(repository, engine) {
  const saveResult = await repository.save(SAVE_PATH, engine.getStateSnapshot());
  printResult(saveResult);
}

function printResult(result) {
  if (result.ok) {
    console.log("OK:", result.value);
  } else {
    console.log("ERR:", result.error.code, "-", result.error.message);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
  });
}

module.exports = { main };

