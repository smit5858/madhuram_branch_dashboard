const express = require("express");
const router = express.Router();
const rajkotExpenseController = require('@/controllers/rajkotExpense.controller')

const { authenticate, loadBranchScope } = require('@/middleware/auth.middleware')

// Admins see every branch's entries, everyone else only their assigned branch. Adding, deleting,
// resetting the count and updating the balance are admin only; accepting is for employees of
// the entry's branch (all enforced in the controller).
router.use(authenticate, loadBranchScope)

router.get('/options', rajkotExpenseController.options)
router.get('/products', rajkotExpenseController.products)
router.get('/summary', rajkotExpenseController.summary)
router.post('/count/reset', rajkotExpenseController.resetCount)
router.post('/balance/update', rajkotExpenseController.updateBalance)
router.get('/', rajkotExpenseController.list)
router.post('/', rajkotExpenseController.create)
router.post('/:id/accept', rajkotExpenseController.accept)
router.delete('/:id', rajkotExpenseController.remove)

module.exports = router;
