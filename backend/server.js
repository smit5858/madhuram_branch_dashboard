require("module-alias/register");
const express = require("express");
const morgan = require("morgan");
const cors = require("cors");
require('dotenv').config()
const sequelize = require("@/config/db");
require("@/models");
const authRoutes = require("@/routes/auth.route");
const branchRoutes = require("@/routes/branch.route");
const employeeRoutes = require("@/routes/employee.route");
const roleRoutes = require("@/routes/role.route");
const productRoutes = require("@/routes/product.route");
const saleRoutes = require("@/routes/sale.route");
const customerRoutes = require("@/routes/customer.route");
const incomeRoutes = require("@/routes/income.route");
const expenseRoutes = require("@/routes/expense.route");
const rajkotExpenseRoutes = require("@/routes/rajkotExpense.route");
const serialRoutes = require("@/routes/serial.route");
const saleReturnRoutes = require("@/routes/saleReturn.route");

const app = express();
app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

app.get('/', (req, res) => {
    res.send("Server Start");
});

app.use("/auth", authRoutes);
app.use("/api/branch", branchRoutes);
app.use("/api/employee", employeeRoutes);
app.use("/api/role", roleRoutes);
app.use("/api/product", productRoutes);
app.use("/api/sale", saleRoutes);
app.use("/api/customer", customerRoutes);
app.use("/api/income", incomeRoutes);
app.use("/api/expense", expenseRoutes);
app.use("/api/rajkot-expense", rajkotExpenseRoutes);
app.use("/api/serial", serialRoutes);
app.use("/api/sale-return", saleReturnRoutes);

const PORT = process.env.PORT || 3000;

const startServer = async () => {
    try {
        await sequelize.authenticate();
        console.log("Database connected ...");
        await sequelize.sync();
        console.log("Tables synced ...");
    } catch (err) {
        console.error("Database connection failed:", err.message);
    }

    app.listen(PORT, '0.0.0.0', () => {
        console.log(`Server started on http://localhost:${PORT}`);
    });
};

startServer();
