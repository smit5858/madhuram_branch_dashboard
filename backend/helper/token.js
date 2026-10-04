const jwt = require("jsonwebtoken");

exports.generateAccessToken = (payload) => {
    return jwt.sign(payload, process.env.JWT_SECRET, {
        expiresIn: process.env.ACCESS_TOKEN_EXPIRY || "1h",
    });
};

exports.verifyAccessToken = (token) => {
    return jwt.verify(token, process.env.JWT_SECRET);
};

exports.generateRefreshToken = (payload) => {
    const secret = process.env.REFRESH_TOKEN_SECRET || (process.env.JWT_SECRET ? process.env.JWT_SECRET + "_refresh" : "default_refresh_secret");
    return jwt.sign(payload, secret, {
        expiresIn: process.env.REFRESH_TOKEN_EXPIRY || "7d",
    });
};

exports.verifyRefreshToken = (token) => {
    const secret = process.env.REFRESH_TOKEN_SECRET || (process.env.JWT_SECRET ? process.env.JWT_SECRET + "_refresh" : "default_refresh_secret");
    return jwt.verify(token, secret);
};