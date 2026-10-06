const express = require("express");
const router = express.Router();
const productController = require('@/controllers/product.controller')

const { authenticate, loadBranchScope } = require('@/middleware/auth.middleware')

// Everyone sees every branch's stock; non-admins can only change their assigned branch (enforced in the controller)
router.use(authenticate, loadBranchScope)

router.get('/branches', productController.branches)
router.post('/serials/check', productController.checkSerials)
router.get('/', productController.product)
router.post('/', productController.createProduct)
router.put('/:id', productController.updateProduct)
router.delete('/:id', productController.deleteProduct)

module.exports = router;
