const express = require("express");
const router = express.Router();
const expenseController = require('@/controllers/expense.controller')

const { authenticate, loadBranchScope } = require('@/middleware/auth.middleware')

// Admins see every branch's expenses, everyone else only their assigned branch. Members update only
// their own branch's balance; resetting a balance is admin only (all enforced in the controller)
router.use(authenticate, loadBranchScope)

router.get('/options', expenseController.expenseOptions)
router.get('/summary', expenseController.expenseSummary)
router.get('/balance', expenseController.expenseBalance)
router.post('/balance/update', expenseController.updateExpenseBalance)
router.post('/balance/reset', expenseController.resetExpenseBalance)
router.get('/', expenseController.expense)
router.post('/', expenseController.createExpense)
router.put('/:id', expenseController.updateExpense)
router.delete('/:id', expenseController.deleteExpense)

module.exports = router;
