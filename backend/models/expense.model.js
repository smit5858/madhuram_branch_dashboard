const sequelize = require('@/config/db')
const { ledgerFields, ledgerIndexes } = require('@/models/ledger.fields')

// Money a branch spent (rent, salaries, electricity, ...)
const Expense = sequelize.define(
    "Expense",
    ledgerFields({ withPaymentMethod: true }),
    {
        tableName: "expense",
        timestamps: true,
        indexes: ledgerIndexes(),
    },
)

module.exports = Expense;
