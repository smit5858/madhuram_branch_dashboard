const express = require("express");
const router = express.Router();
const customerController = require('@/controllers/customer.controller')

const { authenticate, loadBranchScope } = require('@/middleware/auth.middleware')

// Customers are shared by every branch; deleting one is admin only (enforced in the controller)
router.use(authenticate, loadBranchScope)

router.get('/suggest', customerController.suggestCustomers)
router.get('/', customerController.customer)
router.get('/:id', customerController.customerById)
router.post('/', customerController.createCustomer)
router.put('/:id', customerController.updateCustomer)
router.delete('/:id', customerController.deleteCustomer)

module.exports = router;
