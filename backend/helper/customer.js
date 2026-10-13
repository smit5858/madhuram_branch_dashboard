const { Op } = require("sequelize");
const { Customer } = require("@/models/index");

// Shared by the customer and sale controllers so both validate, normalise and match customers
// the same way.
//
// Matching: phone number is the identity. Every phone is normalised to E.164 before it is
// stored or compared, and customer.phone has a unique index, so a number exists at most once.
// A customer without a phone falls back to email; two customers who only share a name are
// never treated as the same person.

const E164_REGEX = /^\+[1-9]\d{6,14}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PINCODE_REGEX = /^[1-9]\d{5}$/;

const LIMITS = { name: 255, email: 255, address: 500, city: 100, companyName: 255 };

// "+91 98765-43210", "0091 9876543210" and "9876543210" all become "+919876543210".
// Returns null when the value can't be a phone number.
const normalizePhone = (value) => {
    if (typeof value !== "string") return null;
    let phone = value.trim().replace(/[\s().-]/g, "");
    if (!phone) return null;
    if (phone.startsWith("00")) phone = `+${phone.slice(2)}`;
    // A bare 10-digit Indian mobile number (the app's default country)
    if (/^[6-9]\d{9}$/.test(phone)) phone = `+91${phone}`;
    return E164_REGEX.test(phone) ? phone : null;
};

// Lower-cased, single-spaced name, for comparing what a user typed with a stored name
const comparableName = (name) => (name ?? "").trim().replace(/\s+/g, " ").toLowerCase();

// Escapes LIKE wildcards so a search for "50%" or "a_b" matches literally
const escapeLike = (value) => value.replace(/[\\%_]/g, "\\$&");

const optionalText = (value, label, max) => {
    if (value === undefined || value === null) return { value: null };
    if (typeof value !== "string") return { error: `Invalid ${label.toLowerCase()}` };
    const trimmed = value.trim().replace(/\s+/g, " ");
    if (trimmed.length > max) return { error: `${label} must be at most ${max} characters` };
    return { value: trimmed || null };
};

// Validates customer fields. `requirePhone` is set for sales, which always need a phone number.
// Returns { error } or { values: { name, phone, email, address, pincode, city, companyName } }.
const parseCustomerFields = (input, { requirePhone = false, nameLabel = "Customer name", phoneLabel = "Phone number" } = {}) => {
    const { name, phone, email, address, pincode, city, companyName } = input || {};

    const parsedName = optionalText(name, nameLabel, LIMITS.name);
    if (parsedName.error) return { error: parsedName.error };
    if (!parsedName.value) return { error: `${nameLabel} is required` };

    const hasPhone = typeof phone === "string" && phone.trim() !== "";
    if (phone !== undefined && phone !== null && typeof phone !== "string") return { error: "Enter a valid phone number" };
    if (!hasPhone && requirePhone) return { error: `${phoneLabel} is required` };
    const parsedPhone = hasPhone ? normalizePhone(phone) : null;
    if (hasPhone && !parsedPhone) return { error: "Enter a valid phone number" };

    const parsedEmail = optionalText(email, "Email", LIMITS.email);
    if (parsedEmail.error) return { error: parsedEmail.error };
    if (parsedEmail.value && !EMAIL_REGEX.test(parsedEmail.value)) return { error: "Enter a valid email address" };

    const parsedAddress = optionalText(address, "Address", LIMITS.address);
    if (parsedAddress.error) return { error: parsedAddress.error };

    const parsedPincode = optionalText(typeof pincode === "number" ? String(pincode) : pincode, "Pincode", 10);
    if (parsedPincode.error) return { error: parsedPincode.error };
    if (parsedPincode.value && !PINCODE_REGEX.test(parsedPincode.value)) return { error: "Enter a valid 6-digit pincode" };

    const parsedCity = optionalText(city, "City", LIMITS.city);
    if (parsedCity.error) return { error: parsedCity.error };

    const parsedCompany = optionalText(companyName, "Company / shop / garage name", LIMITS.companyName);
    if (parsedCompany.error) return { error: parsedCompany.error };

    return {
        values: {
            name: parsedName.value,
            phone: parsedPhone,
            email: parsedEmail.value ? parsedEmail.value.toLowerCase() : null,
            address: parsedAddress.value,
            pincode: parsedPincode.value,
            city: parsedCity.value,
            companyName: parsedCompany.value,
        },
    };
};

// The existing customer these details would duplicate, if any: same phone number, or, for a
// customer without a phone, the same email. `excludeId` skips the customer being edited.
const findDuplicateCustomer = async ({ phone, email }, { excludeId, transaction } = {}) => {
    const notSelf = excludeId ? { id: { [Op.ne]: excludeId } } : {};
    if (phone) return Customer.findOne({ where: { phone, ...notSelf }, transaction });
    if (email) return Customer.findOne({ where: { email, ...notSelf }, transaction });
    return null;
};

const duplicateMessage = (existing, { phone }) =>
    phone
        ? `Phone number ${phone} is already saved for customer "${existing.name}"`
        : `Email ${existing.email} is already saved for customer "${existing.name}"`;

const toCustomerResponse = (customer) => ({
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    email: customer.email,
    address: customer.address,
    pincode: customer.pincode,
    city: customer.city,
    companyName: customer.companyName,
    createdAt: customer.createdAt,
    updatedAt: customer.updatedAt,
});

module.exports = {
    normalizePhone,
    comparableName,
    escapeLike,
    parseCustomerFields,
    findDuplicateCustomer,
    duplicateMessage,
    toCustomerResponse,
};
