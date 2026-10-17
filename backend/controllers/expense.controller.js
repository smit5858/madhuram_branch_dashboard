const { Expense } = require("@/models/index");
const { EXPENSE_CATEGORIES, createLedgerController } = require("@/helper/ledger");
const { createBalanceController } = require("@/helper/ledgerBalance");

// Branch access, validation and totals are shared with income; see helper/ledger.js
const expense = createLedgerController({
    Model: Expense,
    label: "expenses",
    singular: "expense",
    categories: EXPENSE_CATEGORIES,
    withPaymentMethod: true,
});

// Total Balance with Update / Reset; kept apart from the income balance (helper/ledgerBalance.js)
const balance = createBalanceController({ Model: Expense, kind: "expense", title: "Expense" });

exports.expenseOptions = expense.options;
exports.expense = expense.list;
exports.expenseSummary = expense.summary;
exports.createExpense = expense.create;
exports.updateExpense = expense.update;
exports.deleteExpense = expense.remove;
exports.expenseBalance = balance.balance;
exports.updateExpenseBalance = balance.updateBalance;
exports.resetExpenseBalance = balance.resetBalance;
