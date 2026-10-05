const express = require("express");
const router = express.Router();
const branchController = require('@/controllers/branch.controller')

const { authenticate } = require('@/middleware/auth.middleware')

router.get('/', authenticate, branchController.branch)
router.post('/', authenticate, branchController.createBranch)
router.put('/:id', authenticate, branchController.updateBranch)
router.delete('/:id', authenticate, branchController.deleteBranch)

module.exports = router;
