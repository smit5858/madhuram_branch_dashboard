const Employee = require('@/models/employee.model');
const Roles = require('@/models/role.model')

Roles.hasMany(Employee, {foreignKey: "roleId"});
Employee.belongsTo(Roles, {foreignKey: "roleId"});

module.exports = {
    Employee,
    Roles
}