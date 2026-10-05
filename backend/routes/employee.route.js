const express = require("express");
const router = express.Router();
const employeeController = require('@/controllers/employee.controller')

const { authenticate, authorize } = require('@/middleware/auth.middleware')

// Employee management is admin only
router.use(authenticate, authorize("admin"))

router.get('/', employeeController.employee)
router.get('/:id', employeeController.employeeById)
router.post('/', employeeController.createEmployee)
router.put('/:id', employeeController.updateEmployee)
router.delete('/:id', employeeController.deleteEmployee)

module.exports = router;
