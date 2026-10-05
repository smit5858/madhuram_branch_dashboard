const Employee = require('@/models/employee.model');
const Roles = require('@/models/role.model')
const Branch = require('@/models/branch.model')
const Product = require('@/models/product.model')
const ProductStock = require('@/models/productStock.model')

Roles.hasMany(Employee, {foreignKey: "roleId"});
Employee.belongsTo(Roles, {foreignKey: "roleId"});

// Deleting a branch leaves its employees unassigned instead of blocking the branch delete
Branch.hasMany(Employee, {foreignKey: "branchId", onDelete: "SET NULL"});
Employee.belongsTo(Branch, {foreignKey: "branchId", onDelete: "SET NULL"});

// Stock belongs to exactly one product and one branch; it goes away with either of them
Product.hasMany(ProductStock, {foreignKey: "productId", as: "stocks", onDelete: "CASCADE"});
ProductStock.belongsTo(Product, {foreignKey: "productId", onDelete: "CASCADE"});

Branch.hasMany(ProductStock, {foreignKey: "branchId", onDelete: "CASCADE"});
ProductStock.belongsTo(Branch, {foreignKey: "branchId", onDelete: "CASCADE"});

module.exports = {
    Employee,
    Roles,
    Branch,
    Product,
    ProductStock,
}
