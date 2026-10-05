const { DataTypes } = require('sequelize')
const sequelize = require('@/config/db')

const Branch = sequelize.define(
    "Branch",
    {
        "id": {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        "name": {
            type: DataTypes.STRING,
            allowNull: false,
        },
        address: {
            type: DataTypes.STRING(500),
            allowNull: true,
        },
        isActive: {
            type: DataTypes.BOOLEAN,
            defaultValue: true,
        },
        deletedAt: {
            type: DataTypes.DATE,
            allowNull: true,
        },
    },
    {
        tableName: "branch",
        timestamps: true, 
        indexes: [{ unique: true, fields: ["name"] }],
    },
)

module.exports = Branch;
