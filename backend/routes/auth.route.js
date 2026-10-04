const express = require("express");
const router = express.Router();
const authController = require('@/controllers/auth.controller')

const { authenticate } = require('@/middleware/auth.middleware')

router.post('/login', authController.login)
router.post('/logout', authenticate, authController.logout)

module.exports = router;