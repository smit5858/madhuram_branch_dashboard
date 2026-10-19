// What kind of product something is, and which rules follow from that.
//
//  - Standard: plain quantity in product_stock
//  - Serialized: physical units, one product_serial row per unit in stock (quantity = rows)
//  - Software: licenses / activation keys. Each has a serial_unit (its status and history) but
//    never a product_serial row, so buying, selling, installing or returning one never moves
//    physical stock. A branch's product_stock row stays at 0 and only marks that the branch
//    offers the product.
//  - Service: installation services. No stock and no keys; each unit sold gets a generated
//    installation ID (INS-00012-1) so every installation is still traceable by serial number.
const PRODUCT_TYPE = {
    STANDARD: "Standard",
    SERIALIZED: "Serialized",
    SOFTWARE: "Software",
    SERVICE: "Service",
};

const PRODUCT_TYPES = Object.values(PRODUCT_TYPE);

// Products saved before product types existed only have hasSerialNumber
const typeOf = (product) => product?.productType || (product?.hasSerialNumber ? PRODUCT_TYPE.SERIALIZED : PRODUCT_TYPE.STANDARD);

// Physical stock (product_stock.quantity) is kept only for these
const tracksStock = (product) => [PRODUCT_TYPE.STANDARD, PRODUCT_TYPE.SERIALIZED].includes(typeOf(product));

// Each unit sold names a serial number chosen by the user (physical serial or license key)
const usesSerialNumbers = (type) => type === PRODUCT_TYPE.SERIALIZED || type === PRODUCT_TYPE.SOFTWARE;

// Units of a Service sale are numbered by the sale, at most this many per sale
const MAX_SERVICE_UNITS = 100;

const serviceUnitPrefix = (saleId) => `INS-${String(saleId).padStart(5, "0")}-`;

module.exports = {
    PRODUCT_TYPE,
    PRODUCT_TYPES,
    typeOf,
    tracksStock,
    usesSerialNumbers,
    MAX_SERVICE_UNITS,
    serviceUnitPrefix,
};
