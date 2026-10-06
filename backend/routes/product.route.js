const express = require("express");
const router = express.Router();
const productController = require('@/controllers/product.controller')

const { authenticate, loadBranchScope } = require('@/middleware/auth.middleware')

// Admins see every branch's stock, everyone else only their assigned branch (enforced in the controller)
router.use(authenticate, loadBranchScope)

router.get('/branches', productController.branches)
router.post('/serials/check', productController.checkSerials)
router.get('/', productController.product)
router.post('/', productController.createProduct)
router.put('/:id', productController.updateProduct)
router.delete('/:id', productController.deleteProduct)

module.exports = router;
