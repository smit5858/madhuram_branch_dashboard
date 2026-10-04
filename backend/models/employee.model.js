const { DataTypes } = require('sequelize')
const sequelize = require('@/config/db')

const Employee = sequelize.define(
    "Employee",
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
        email:{
            type: DataTypes.STRING,
            allowNull:false,
            validate: {isEmail: true },
        },
        password: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        roleId: {
            type: DataTypes.INTEGER,
            allowNull: true,
        },
        isActive: {
            type: DataTypes.BOOLEAN,
            defaultValue: true,
        },
        phone: {
            type: DataTypes.STRING(15),
            allowNull: true,
        },
        allowedBranch: {
            type: DataTypes.STRING,
            allowNull: true, 
        },
        tokenInvalidatedAt: {
          type: DataTypes.DATE,
          allowNull: true,
        },
        refreshToken: {
          type: DataTypes.TEXT,
          allowNull: true,
        },
        deletedAt: {
          type: DataTypes.DATE,
          allowNull: true,
        },
    },
    {
        tableName: "employee",
        timestamps: true, 
        indexes: [{ unique: true, fields: ["email"] }],
    },
)

module.exports = Employee;