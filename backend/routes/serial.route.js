const express = require("express");
const router = express.Router();
const serialController = require('@/controllers/serial.controller')

const { authenticate, loadBranchScope } = require('@/middleware/auth.middleware')

// Admins see every serial number; everyone else the ones their branch has been part of.
// Transfers and license releases are admin only; license actions are for admins and the branch
// whose sale the license is on (all enforced in the controller).
router.use(authenticate, loadBranchScope)

router.get('/options', serialController.options)
router.get('/detail', serialController.detail)
router.get('/summary', serialController.summary)
router.post('/transfer', serialController.transfer)
// Software licenses and installation services
router.post('/install', serialController.install)
router.post('/activate', serialController.activate)
router.post('/renew', serialController.renew)
router.post('/deactivate', serialController.deactivate)
router.post('/release', serialController.release)
router.get('/', serialController.list)

module.exports = router;
