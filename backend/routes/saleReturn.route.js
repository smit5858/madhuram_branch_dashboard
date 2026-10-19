const express = require("express");
const router = express.Router();
const saleReturnController = require('@/controllers/saleReturn.controller')

const { authenticate, loadBranchScope } = require('@/middleware/auth.middleware')

// Members record returns of their own branch's sales; deciding on a return is admin only
// (all enforced in the controller)
router.use(authenticate, loadBranchScope)

router.get('/options', saleReturnController.options)
router.get('/', saleReturnController.list)
router.post('/', saleReturnController.create)
router.post('/:id/decision', saleReturnController.decide)

module.exports = router;
