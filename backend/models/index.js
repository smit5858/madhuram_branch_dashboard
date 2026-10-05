const Employee = require('@/models/employee.model');
const Roles = require('@/models/role.model')
const Branch = require('@/models/branch.model')

Roles.hasMany(Employee, {foreignKey: "roleId"});
Employee.belongsTo(Roles, {foreignKey: "roleId"});

// Deleting a branch leaves its employees unassigned instead of blocking the branch delete
Branch.hasMany(Employee, {foreignKey: "branchId", onDelete: "SET NULL"});
Employee.belongsTo(Branch, {foreignKey: "branchId", onDelete: "SET NULL"});

module.exports = {
    Employee,
    Roles,
    Branch
}