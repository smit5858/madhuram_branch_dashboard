const express = require("express");
const router = express.Router();
const expenseController = require('@/controllers/expense.controller')

const { authenticate, loadBranchScope } = require('@/middleware/auth.middleware')

// Admins see every branch's expenses, everyone else only their assigned branch (enforced in the controller)
router.use(authenticate, loadBranchScope)

router.get('/options', expenseController.expenseOptions)
router.get('/summary', expenseController.expenseSummary)
router.get('/', expenseController.expense)
router.post('/', expenseController.createExpense)
router.put('/:id', expenseController.updateExpense)
router.delete('/:id', expenseController.deleteExpense)

module.exports = router;
