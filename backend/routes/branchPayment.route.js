const express = require("express");
const router = express.Router();
const branchPaymentController = require('@/controllers/branchPayment.controller')

const { authenticate, loadBranchScope } = require('@/middleware/auth.middleware')

// Admins see every branch payment, everyone else only payments their branch sent or received.
// Who may add, edit, complete or cancel is decided per payment in the controller.
router.use(authenticate, loadBranchScope)

router.get('/options', branchPaymentController.options)
router.get('/summary', branchPaymentController.summary)
router.get('/', branchPaymentController.list)
router.post('/', branchPaymentController.create)
router.get('/:id', branchPaymentController.details)
router.put('/:id', branchPaymentController.update)
router.post('/:id/complete', branchPaymentController.complete)
router.post('/:id/cancel', branchPaymentController.cancel)

module.exports = router;
