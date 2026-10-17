const express = require("express");
const router = express.Router();
const incomeController = require('@/controllers/income.controller')

const { authenticate, loadBranchScope } = require('@/middleware/auth.middleware')

// Admins see every branch's income, everyone else only their assigned branch. Members update only
// their own branch's balance; resetting a balance is admin only (all enforced in the controller)
router.use(authenticate, loadBranchScope)

router.get('/options', incomeController.incomeOptions)
router.get('/summary', incomeController.incomeSummary)
router.get('/balance', incomeController.incomeBalance)
router.post('/balance/update', incomeController.updateIncomeBalance)
router.post('/balance/reset', incomeController.resetIncomeBalance)
router.get('/', incomeController.income)
router.post('/', incomeController.createIncome)
router.put('/:id', incomeController.updateIncome)
router.delete('/:id', incomeController.deleteIncome)

module.exports = router;
