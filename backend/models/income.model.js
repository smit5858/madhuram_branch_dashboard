const sequelize = require('@/config/db')
const { ledgerFields, ledgerIndexes } = require('@/models/ledger.fields')

// Money a branch received outside of product sales (service, commission, rent, ...)
const Income = sequelize.define(
    "Income",
    ledgerFields(),
    {
        tableName: "income",
        timestamps: true,
        indexes: ledgerIndexes(),
    },
)

module.exports = Income;
