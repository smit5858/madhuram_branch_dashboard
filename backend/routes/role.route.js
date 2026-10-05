const express = require("express");
const router = express.Router();
const roleController = require('@/controllers/role.controller')

const { authenticate, authorize } = require('@/middleware/auth.middleware')

router.get('/', authenticate, authorize("admin"), roleController.role)

module.exports = router;
