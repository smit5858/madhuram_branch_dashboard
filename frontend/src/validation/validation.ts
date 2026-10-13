import * as Yup from "yup";
import { isValidPhoneNumber } from "libphonenumber-js";
import { isValid, parse } from "date-fns";
import { OTHER_PRODUCT } from "@/models/Sale";

export const validateschema = Yup.object({
	name: Yup.string().required("Name is required"),
	selection: Yup.string().required("Selection is required"),
	password: Yup.string().required("Password is required"),
	email: Yup.string().email("Invalid email address").required("Email is required"),
	phone: Yup.string()
		.required("Phone number is required")
		.test("valid-phone", "Enter a valid phone number", (value) => !value || isValidPhoneNumber(value)),
	date: Yup.string()
		.required("Date is required")
		.test("valid-date", "Enter a valid date", (value) => !value || isValid(parse(value, "yyyy-MM-dd", new Date()))),
});

export const loginSchema = Yup.object({
	email: Yup.string().trim().email("Enter a valid email address").required("Email is required"),
	password: Yup.string().required("Password is required"),
});

export const branchSchema = Yup.object({
	name: Yup.string().trim().max(255, "Name must be at most 255 characters").required("Name is required"),
	isActive: Yup.boolean().required(),
	address: Yup.string().trim().max(500, "Address must be at most 500 characters").required("Address is required"),
});

// Password is required when creating; when editing, blank keeps the current one
export const employeeSchema = (isEdit: boolean) => Yup.object({
	name: Yup.string().trim().max(255, "Name must be at most 255 characters").required("Name is required"),
	email: Yup.string().trim().email("Enter a valid email address").max(255, "Email must be at most 255 characters").required("Email is required"),
	phone: Yup.string().test("valid-phone", "Enter a valid phone number", (value) => !value || isValidPhoneNumber(value)),
	password: isEdit
		? Yup.string().min(6, "Password must be at least 6 characters").max(100, "Password must be at most 100 characters")
		: Yup.string().min(6, "Password must be at least 6 characters").max(100, "Password must be at most 100 characters").required("Password is required"),
	roleId: Yup.string().required("Role is required"),
	branchId: Yup.string().required("Branch is required"),
	isActive: Yup.boolean().required(),
});

export const MAX_PRODUCT_QUANTITY = 1000000000;

/** Serial numbers typed one per line (commas also separate them), trimmed, blanks dropped */
export const splitSerialNumbers = (text?: string) =>
	(text ?? "").split(/[\n,]+/).map((sn) => sn.trim()).filter(Boolean);

export const productSchema = Yup.object({
	name: Yup.string().trim().max(255, "Name must be at most 255 characters").required("Product name is required"),
	hasSerialNumber: Yup.boolean(),
	// Serial-tracked products take serial numbers instead of a quantity
	quantity: Yup.mixed().when("hasSerialNumber", ([hasSerialNumber]: boolean[]) => hasSerialNumber
		? Yup.mixed().notRequired()
		: Yup.number()
			.typeError("Quantity must be a number")
			.integer("Quantity must be a whole number")
			.min(0, "Quantity cannot be negative")
			.max(MAX_PRODUCT_QUANTITY, "Quantity is too large")
			.required("Quantity is required")),
	serialNumbers: Yup.string().when("hasSerialNumber", ([hasSerialNumber]: boolean[], schema: Yup.StringSchema) => hasSerialNumber
		? schema
			// Repeats and serial numbers that already exist are checked by the form field itself
			.test("serial-length", "Each serial number must be at most 100 characters", (value) => splitSerialNumbers(value).every((sn) => sn.length <= 100))
		: schema),
	branchId: Yup.string().required("Branch is required"),
});

// Optional customer fields, shared by the Customers module and new customers in the sale form
const customerEmail = () => Yup.string().trim().email("Enter a valid email address").max(255, "Email must be at most 255 characters");
const customerAddress = () => Yup.string().trim().max(500, "Address must be at most 500 characters");
const customerPincode = () => Yup.string().trim().matches(/^[1-9]\d{5}$/, { message: "Enter a valid 6-digit pincode", excludeEmptyString: true });
const customerCity = () => Yup.string().trim().max(100, "City must be at most 100 characters");
const customerCompany = () => Yup.string().trim().max(255, "Name must be at most 255 characters");

// Phone is optional for a customer (sales always need one); duplicates are checked by the API
export const customerSchema = Yup.object({
	name: Yup.string().trim().max(255, "Name must be at most 255 characters").required("Customer name is required"),
	phone: Yup.string().test("valid-phone", "Enter a valid phone number", (value) => !value || isValidPhoneNumber(value)),
	email: customerEmail(),
	address: customerAddress(),
	pincode: customerPincode(),
	city: customerCity(),
	companyName: customerCompany(),
});

export const MAX_SALE_AMOUNT = 1000000000;

// Optional details only apply while entering a new customer, not once one is picked
const whenNewCustomer = (schema: Yup.StringSchema) => Yup.string().when("customer", {
	is: (customer: unknown) => !customer,
	then: () => schema,
});

// Stock availability is checked by the form against the selected branch's stock, and again by the API
export const saleSchema = Yup.object({
	customer: Yup.object().nullable(),
	customerName: Yup.string().trim().max(255, "Name must be at most 255 characters").required("Customer name is required"),
	customerPhone: Yup.string()
		.required("Customer phone number is required")
		.test("valid-phone", "Enter a valid phone number", (value) => !value || isValidPhoneNumber(value)),
	customerEmail: whenNewCustomer(customerEmail()),
	customerAddress: whenNewCustomer(customerAddress()),
	customerPincode: whenNewCustomer(customerPincode()),
	customerCity: whenNewCustomer(customerCity()),
	customerCompany: whenNewCustomer(customerCompany()),
	productId: Yup.string().required("Product is required"),
	productName: Yup.string().when("productId", {
		is: OTHER_PRODUCT,
		then: (schema) => schema.trim().max(255, "Product name must be at most 255 characters").required("Product name is required"),
	}),
	quantity: Yup.number()
		.typeError("Quantity must be a number")
		.integer("Quantity must be a whole number")
		.min(1, "Quantity must be at least 1")
		.max(MAX_PRODUCT_QUANTITY, "Quantity is too large")
		.required("Quantity is required"),
	sellingAmount: Yup.number()
		.typeError("Selling amount must be a number")
		.moreThan(0, "Selling amount must be greater than 0")
		.max(MAX_SALE_AMOUNT, "Selling amount is too large")
		.test("two-decimals", "At most 2 decimal places", (value) => value === undefined || /^\d+(\.\d{1,2})?$/.test(String(value)))
		.required("Selling amount is required"),
	saleDate: Yup.string()
		.required("Sale date is required")
		.test("valid-date", "Enter a valid date", (value) => !value || isCompleteDate(value)),
	branchId: Yup.string().required("Branch is required"),
});

/** True for a complete, real "yyyy-MM-dd" date (DatePicker stores partial input as-is) */
export const isCompleteDate = (value?: string) =>
	!!value && /^\d{4}-\d{2}-\d{2}$/.test(value) && isValid(parse(value, "yyyy-MM-dd", new Date()));

export const productFilterSchema = Yup.object({
	search: Yup.string(),
	startDate: Yup.string().test("valid-date", "Enter a valid date", (value) => !value || isCompleteDate(value)),
	endDate: Yup.string()
		.test("valid-date", "Enter a valid date", (value) => !value || isCompleteDate(value))
		.test("after-start", "End date can't be before start date", function (value) {
			const { startDate } = this.parent;
			// yyyy-MM-dd strings compare correctly as text
			return !value || !isCompleteDate(value) || !isCompleteDate(startDate) || value >= startDate;
		}),
});
