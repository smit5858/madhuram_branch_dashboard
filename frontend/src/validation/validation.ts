import * as Yup from "yup";
import { isValidPhoneNumber } from "libphonenumber-js";
import { isValid, parse } from "date-fns";

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

export const productSchema = Yup.object({
	name: Yup.string().trim().max(255, "Name must be at most 255 characters").required("Product name is required"),
	quantity: Yup.number()
		.typeError("Quantity must be a number")
		.integer("Quantity must be a whole number")
		.min(0, "Quantity cannot be negative")
		.max(MAX_PRODUCT_QUANTITY, "Quantity is too large")
		.required("Quantity is required"),
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
