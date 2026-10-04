require("module-alias/register");
const express = require("express");
const morgan = require("morgan");
const cors = require("cors");
require('dotenv').config()
const sequelize = require("@/config/db");
require("@/models");
const authRoutes = require("@/routes/auth.route");

const app = express();
app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

app.get('/', (req, res) => {
    res.send("Server Start");
});

app.use("/auth", authRoutes);

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
