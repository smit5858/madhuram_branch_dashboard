const Employee = require('@/models/employee.model');
const Roles = require('@/models/role.model')
const Branch = require('@/models/branch.model')
const Product = require('@/models/product.model')
const ProductStock = require('@/models/productStock.model')
const ProductSerial = require('@/models/productSerial.model')
const Sale = require('@/models/sale.model')
const Customer = require('@/models/customer.model')
const Income = require('@/models/income.model')
const Expense = require('@/models/expense.model')
const RajkotExpense = require('@/models/rajkotExpense.model')
const RajkotExpenseItem = require('@/models/rajkotExpenseItem.model')
const RajkotExpenseSerial = require('@/models/rajkotExpenseSerial.model')
const RajkotExpenseCounter = require('@/models/rajkotExpenseCounter.model')
const LedgerBalance = require('@/models/ledgerBalance.model')
const ProductPurchase = require('@/models/productPurchase.model')
const SerialUnit = require('@/models/serialUnit.model')
const SerialEvent = require('@/models/serialEvent.model')
const SaleReturn = require('@/models/saleReturn.model')

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

// In-stock serial numbers go away with their product or branch
Product.hasMany(ProductSerial, {foreignKey: "productId", as: "serials", onDelete: "CASCADE"});
ProductSerial.belongsTo(Product, {foreignKey: "productId", onDelete: "CASCADE"});

Branch.hasMany(ProductSerial, {foreignKey: "branchId", onDelete: "CASCADE"});
ProductSerial.belongsTo(Branch, {foreignKey: "branchId", onDelete: "CASCADE"});

// A sale is owned by its branch. Removing the product from the catalogue keeps the sale
// (it still has productName), only the link is cleared.
Branch.hasMany(Sale, {foreignKey: "branchId", onDelete: "CASCADE"});
Sale.belongsTo(Branch, {foreignKey: "branchId", onDelete: "CASCADE"});

Product.hasMany(Sale, {foreignKey: "productId", onDelete: "SET NULL"});
Sale.belongsTo(Product, {foreignKey: "productId", onDelete: "SET NULL"});

// A sale may belong to a customer. Older sales have none; deleting a customer keeps their
// sales (each still has customerName and customerPhone), only the link is cleared.
Customer.hasMany(Sale, {foreignKey: "customerId", onDelete: "SET NULL"});
Sale.belongsTo(Customer, {foreignKey: "customerId", onDelete: "SET NULL"});

// Income and expense entries are owned by their branch, like sales. The employee who added an
// entry is linked for display; deleting that employee keeps the entry, only the link is cleared.
for (const Ledger of [Income, Expense]) {
    Branch.hasMany(Ledger, {foreignKey: "branchId", onDelete: "CASCADE"});
    Ledger.belongsTo(Branch, {foreignKey: "branchId", onDelete: "CASCADE"});
    Ledger.belongsTo(Employee, {foreignKey: "createdBy", as: "creator", onDelete: "SET NULL"});
}

// Each branch has one income and one expense balance row; they go away with the branch
Branch.hasMany(LedgerBalance, {foreignKey: "branchId", onDelete: "CASCADE"});
LedgerBalance.belongsTo(Branch, {foreignKey: "branchId", onDelete: "CASCADE"});

// Rajkot Expense entries are owned by their branch, like sales. Their product rows and serial
// numbers go with the entry. Removing a product from the catalogue keeps the rows (each still
// has productName), only the link is cleared; the same goes for the employees on an entry.
Branch.hasMany(RajkotExpense, {foreignKey: "branchId", onDelete: "CASCADE"});
RajkotExpense.belongsTo(Branch, {foreignKey: "branchId", onDelete: "CASCADE"});
RajkotExpense.belongsTo(Employee, {foreignKey: "createdBy", as: "creator", onDelete: "SET NULL"});
RajkotExpense.belongsTo(Employee, {foreignKey: "acceptedBy", as: "acceptor", onDelete: "SET NULL"});

RajkotExpense.hasMany(RajkotExpenseItem, {foreignKey: "rajkotExpenseId", as: "items", onDelete: "CASCADE"});
RajkotExpenseItem.belongsTo(RajkotExpense, {foreignKey: "rajkotExpenseId", onDelete: "CASCADE"});

Product.hasMany(RajkotExpenseItem, {foreignKey: "productId", onDelete: "SET NULL"});
RajkotExpenseItem.belongsTo(Product, {foreignKey: "productId", onDelete: "SET NULL"});

RajkotExpenseItem.hasMany(RajkotExpenseSerial, {foreignKey: "rajkotExpenseItemId", as: "serials", onDelete: "CASCADE"});
RajkotExpenseSerial.belongsTo(RajkotExpenseItem, {foreignKey: "rajkotExpenseItemId", onDelete: "CASCADE"});

Branch.hasOne(RajkotExpenseCounter, {foreignKey: "branchId", onDelete: "CASCADE"});
RajkotExpenseCounter.belongsTo(Branch, {foreignKey: "branchId", onDelete: "CASCADE"});

// Serial number history is permanent: removing a product, branch, sale or employee only clears
// the link (names are kept on the rows), never the history itself.
Product.hasMany(SerialUnit, {foreignKey: "productId", onDelete: "SET NULL"});
SerialUnit.belongsTo(Product, {foreignKey: "productId", onDelete: "SET NULL"});
Branch.hasMany(SerialUnit, {foreignKey: "branchId", onDelete: "SET NULL"});
SerialUnit.belongsTo(Branch, {foreignKey: "branchId", onDelete: "SET NULL"});
SerialUnit.belongsTo(Sale, {foreignKey: "currentSaleId", as: "currentSale", constraints: false});

SerialUnit.hasMany(SerialEvent, {foreignKey: "serialUnitId", as: "events", onDelete: "CASCADE"});
SerialEvent.belongsTo(SerialUnit, {foreignKey: "serialUnitId", onDelete: "CASCADE"});
SerialEvent.belongsTo(Employee, {foreignKey: "createdBy", as: "creator", onDelete: "SET NULL"});

Product.hasMany(ProductPurchase, {foreignKey: "productId", onDelete: "SET NULL"});
ProductPurchase.belongsTo(Product, {foreignKey: "productId", onDelete: "SET NULL"});
ProductPurchase.belongsTo(Employee, {foreignKey: "createdBy", as: "creator", onDelete: "SET NULL"});

SerialUnit.hasMany(SaleReturn, {foreignKey: "serialUnitId", as: "returns", onDelete: "CASCADE"});
SaleReturn.belongsTo(SerialUnit, {foreignKey: "serialUnitId", onDelete: "CASCADE"});
Sale.hasMany(SaleReturn, {foreignKey: "saleId", as: "returns", constraints: false});
SaleReturn.belongsTo(Sale, {foreignKey: "saleId", constraints: false});
SaleReturn.belongsTo(Employee, {foreignKey: "createdBy", as: "creator", onDelete: "SET NULL"});
SaleReturn.belongsTo(Employee, {foreignKey: "decidedBy", as: "decider", onDelete: "SET NULL"});
// For the product's type and license terms; the return keeps productName if it is removed
SaleReturn.belongsTo(Product, {foreignKey: "productId", constraints: false});

module.exports = {
    Employee,
    Roles,
    Branch,
    Product,
    ProductStock,
    ProductSerial,
    Sale,
    Customer,
    Income,
    Expense,
    RajkotExpense,
    RajkotExpenseItem,
    RajkotExpenseSerial,
    RajkotExpenseCounter,
    LedgerBalance,
    ProductPurchase,
    SerialUnit,
    SerialEvent,
    SaleReturn,
}
