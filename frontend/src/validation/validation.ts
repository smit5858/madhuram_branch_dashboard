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
