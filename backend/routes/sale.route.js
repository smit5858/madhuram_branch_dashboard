const express = require("express");
const router = express.Router();
const saleController = require('@/controllers/sale.controller')

const { authenticate, loadBranchScope } = require('@/middleware/auth.middleware')

// Admins see every branch's sales, everyone else only their assigned branch (enforced in the controller)
router.use(authenticate, loadBranchScope)

router.get('/products', saleController.saleProducts)
router.get('/summary', saleController.salesSummary)
router.get('/', saleController.sale)
router.post('/', saleController.createSale)
router.put('/:id', saleController.updateSale)
router.delete('/:id', saleController.deleteSale)

module.exports = router;
