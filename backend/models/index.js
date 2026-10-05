const Employee = require('@/models/employee.model');
const Roles = require('@/models/role.model')
const Branch = require('@/models/branch.model')
const Product = require('@/models/product.model')
const ProductStock = require('@/models/productStock.model')
const Sale = require('@/models/sale.model')

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

// A sale is owned by its branch. Removing the product from the catalogue keeps the sale
// (it still has productName), only the link is cleared.
Branch.hasMany(Sale, {foreignKey: "branchId", onDelete: "CASCADE"});
Sale.belongsTo(Branch, {foreignKey: "branchId", onDelete: "CASCADE"});

Product.hasMany(Sale, {foreignKey: "productId", onDelete: "SET NULL"});
Sale.belongsTo(Product, {foreignKey: "productId", onDelete: "SET NULL"});

module.exports = {
    Employee,
    Roles,
    Branch,
    Product,
    ProductStock,
    Sale,
}
