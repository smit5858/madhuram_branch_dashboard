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
