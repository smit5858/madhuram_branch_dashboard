const { Income } = require("@/models/index");
const { INCOME_CATEGORIES, createLedgerController } = require("@/helper/ledger");
const { createBalanceController } = require("@/helper/ledgerBalance");

// Branch access, validation and totals are shared with expenses; see helper/ledger.js.
// Income totals also include the branch's product sales.
const income = createLedgerController({
    Model: Income,
    label: "income",
    singular: "income",
    categories: INCOME_CATEGORIES,
    // Product sales count toward income totals, read live from the sale table
    includeSales: true,
});

// Total Balance with Update / Reset; kept apart from the expense balance (helper/ledgerBalance.js)
const balance = createBalanceController({ Model: Income, kind: "income", title: "Income", includeSales: true });

exports.incomeOptions = income.options;
exports.income = income.list;
exports.incomeSummary = income.summary;
exports.createIncome = income.create;
exports.updateIncome = income.update;
exports.deleteIncome = income.remove;
exports.incomeBalance = balance.balance;
exports.updateIncomeBalance = balance.updateBalance;
exports.resetIncomeBalance = balance.resetBalance;
