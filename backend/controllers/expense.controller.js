const { Expense } = require("@/models/index");
const { EXPENSE_CATEGORIES, createLedgerController } = require("@/helper/ledger");

// Branch access, validation and totals are shared with income; see helper/ledger.js
const expense = createLedgerController({
    Model: Expense,
    label: "expenses",
    singular: "expense",
    categories: EXPENSE_CATEGORIES,
    withPaymentMethod: true,
});

exports.expenseOptions = expense.options;
exports.expense = expense.list;
exports.expenseSummary = expense.summary;
exports.createExpense = expense.create;
exports.updateExpense = expense.update;
exports.deleteExpense = expense.remove;
