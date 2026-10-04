const { DataTypes } = require('sequelize')
const sequelize = require('@/config/db')

const Roles = sequelize.define(
    "Role",
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
        isActive: {
            type: DataTypes.BOOLEAN,
            defaultValue: true,
        },
    },
    {
        tableName: "roles",
        timestamps: true,
        indexes: [{ unique: true, fields: ["name"] }],
    }
) 

module.exports = Roles