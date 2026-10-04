import clsx from "clsx";
import { getIn, type FieldInputProps, type FormikProps } from "formik";
import { forwardRef, useCallback, useRef, useState, type MouseEvent } from "react";
import PhoneInputModule, { type CountryData } from "react-phone-input-2";
import 'react-phone-input-2/lib/style.css'
import './PhoneInput.css'

// react-phone-input-2 ships a CJS bundle; under Vite's interop the default import can
// be the module object ({ default: Component }) instead of the component itself.
const ReactPhoneInput =
    (PhoneInputModule as unknown as { default?: typeof PhoneInputModule }).default ?? PhoneInputModule;

interface PhoneInputProps {
    name?: string;
    label?: string;
    placeholder?: string;
    country?: string;
    preferredCountries?: string[];
    value?: string;
    onChange?: (value: string) => void;
    error?: string;
    disabled?: boolean;
    className?: string;
    field?: FieldInputProps<string>;
    form?: Pick<FormikProps<unknown>, "errors" | "touched" | "setFieldValue" | "setFieldTouched">;
}

const DEFAULT_PREFERRED = ["in", "us", "gb", "ae", "au", "ca"];

const digitsOf = (value: string) => value.replace(/\D/g, "");

const isCountryData = (data: CountryData | object): data is CountryData => "dialCode" in data;

export const PhoneInput = forwardRef<HTMLInputElement, PhoneInputProps>(
    ({ name, label, placeholder, country = "in", preferredCountries = DEFAULT_PREFERRED, value, onChange, error, disabled, className, field, form }, ref) => {
        const fieldName = field?.name ?? name;
        const formError = fieldName && form && getIn(form.touched, fieldName)
            ? getIn(form.errors, fieldName)
            : undefined;
        const displayError = error ?? (typeof formError === "string" ? formError : undefined);

        // Formik holds E.164 ("+919876543210", or "" when only a dial code is typed).
        // The library needs the raw digits it is showing, so keep those locally and
        // resync only when the stored value changes from outside (e.g. resetForm).
        const current = field?.value ?? value ?? "";
        const [raw, setRaw] = useState(() => digitsOf(current));
        const [emitted, setEmitted] = useState(current);
        const [dialCode, setDialCode] = useState("");
        if (current !== emitted) {
            setEmitted(current);
            setRaw(digitsOf(current) || dialCode);
        }

        const inputRef = useRef<HTMLInputElement | null>(null);
        const setInputRef = useCallback((el: HTMLInputElement | null) => {
            inputRef.current = el;
            if (typeof ref === "function") ref(el);
            else if (ref) ref.current = el;
        }, [ref]);

        const handleChange = (digits: string, data: CountryData | object) => {
            const dial = isCountryData(data) ? data.dialCode : "";
            const next = digits === "" || digits === dial ? "" : `+${digits}`;
            setDialCode(dial);
            setRaw(digits);
            setEmitted(next);
            if (fieldName && form) form.setFieldValue(fieldName, next, true);
            onChange?.(next);
        };

        const handleBlur = () => {
            if (fieldName) form?.setFieldTouched(fieldName, true);
        };

        const focusInput = (e: MouseEvent<HTMLDivElement>) => {
            if (disabled || (e.target instanceof Element && e.target.closest(".flag-dropdown"))) return;
            inputRef.current?.focus();
        };

        return (
            <div className="flex flex-col gap-1.5">
                <div
                    onClick={focusInput}
                    data-invalid={!!displayError}
                    className={clsx(
                        "group flex w-full flex-col justify-center rounded-xl px-3 cursor-text transition-colors",
                        label ? "h-14" : "h-10",
                        "bg-gray-100 hover:bg-gray-200 focus-within:bg-gray-100",
                        "has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50 has-[:disabled]:hover:bg-gray-100",
                        "data-[invalid=true]:bg-red-50 data-[invalid=true]:hover:bg-red-100 data-[invalid=true]:focus-within:bg-red-50",
                        className
                    )}
                >
                    {label && (
                        <label
                            htmlFor={fieldName}
                            className="text-xs font-medium text-gray-600 cursor-text group-data-[invalid=true]:text-red-500"
                        >
                            {label}
                        </label>
                    )}
                    <ReactPhoneInput
                        country={country}
                        preferredCountries={preferredCountries}
                        enableSearch
                        disableSearchIcon
                        searchPlaceholder="Search country"
                        value={raw ? `+${raw}` : ""}
                        onChange={handleChange}
                        onBlur={handleBlur}
                        placeholder={placeholder}
                        disabled={disabled}
                        inputProps={{ id: fieldName, name: fieldName, "aria-invalid": !!displayError, ref: setInputRef }}
                        containerClass="phone-field"
                        inputClass="phone-field__input"
                        buttonClass="phone-field__button"
                        dropdownClass="phone-field__dropdown"
                        searchClass="phone-field__search"
                    />
                </div>
                {displayError && <p className="px-1 text-xs text-red-500">{displayError}</p>}
            </div>
        );
    }
);

PhoneInput.displayName = "PhoneInput";
