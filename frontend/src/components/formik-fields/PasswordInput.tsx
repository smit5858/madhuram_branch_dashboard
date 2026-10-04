import clsx from "clsx";
import { forwardRef, useState, type InputHTMLAttributes } from "react";
import { getIn, type FieldInputProps } from "formik";

interface PasswordInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "form" | "type"> {
    error?: string;
    label?: string;
    field?: FieldInputProps<string>;
    form?: { errors: unknown; touched: unknown };
}

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
    ({ className, error, field, form, label, disabled, ...props }, ref) => {
        const [visible, setVisible] = useState(false);

        const fieldName = field?.name ?? props.name;
        const formError = fieldName && form && getIn(form.touched, fieldName)
            ? getIn(form.errors, fieldName)
            : undefined;
        const displayError = error ?? (typeof formError === "string" ? formError : undefined);

        return (
            <div className="flex flex-col gap-1.5">
                <label
                    htmlFor={fieldName}
                    data-invalid={!!displayError}
                    className={clsx(
                        "group relative flex w-full flex-col justify-center rounded-xl px-3 pr-10 cursor-text transition-colors",
                        label ? "h-14" : "h-10",
                        "bg-gray-100 hover:bg-gray-200 focus-within:bg-gray-100",
                        "has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50 has-[:disabled]:hover:bg-gray-100",
                        "data-[invalid=true]:bg-red-50 data-[invalid=true]:hover:bg-red-100 data-[invalid=true]:focus-within:bg-red-50",
                        className
                    )}
                >
                    {label && (
                        <span className="text-xs font-medium text-gray-600 group-data-[invalid=true]:text-red-500">
                            {label}
                        </span>
                    )}
                    <input
                        id={fieldName}
                        {...field}
                        value={field ? (field.value ?? props.value ?? "") : props.value}
                        ref={ref}
                        type={visible ? "text" : "password"}
                        disabled={disabled}
                        autoComplete="current-password"
                        aria-invalid={!!displayError}
                        className="w-full bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400 group-data-[invalid=true]:placeholder:text-red-400 disabled:cursor-not-allowed"
                        {...props}
                    />

                    <button
                        type="button"
                        disabled={disabled}
                        onClick={() => setVisible((v) => !v)}
                        onMouseDown={(e) => e.preventDefault()}
                        aria-label={visible ? "Hide password" : "Show password"}
                        aria-pressed={visible}
                        className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-0.5 text-gray-500 outline-none transition-colors hover:text-gray-900 focus-visible:ring-2 focus-visible:ring-blue-500 group-data-[invalid=true]:text-red-500 disabled:cursor-not-allowed"
                    >
                        {visible ? (
                            <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="size-4">
                                <path
                                    fillRule="evenodd"
                                    d="M3.28 2.22a.75.75 0 00-1.06 1.06l14.5 14.5a.75.75 0 101.06-1.06l-1.745-1.745a10.029 10.029 0 003.3-4.38 1.651 1.651 0 000-1.185A10.004 10.004 0 009.999 3a9.956 9.956 0 00-4.744 1.194L3.28 2.22zM7.752 6.69l1.092 1.092a2.5 2.5 0 013.374 3.373l1.091 1.092a4 4 0 00-5.557-5.557z"
                                    clipRule="evenodd"
                                />
                                <path d="M10.748 13.93l2.523 2.523a9.987 9.987 0 01-3.27.547c-4.258 0-7.894-2.66-9.337-6.41a1.651 1.651 0 010-1.186A10.007 10.007 0 012.839 6.02L6.07 9.252a4 4 0 004.678 4.678z" />
                            </svg>
                        ) : (
                            <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="size-4">
                                <path d="M10 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" />
                                <path
                                    fillRule="evenodd"
                                    d="M.664 10.59a1.651 1.651 0 010-1.186A10.004 10.004 0 0110 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0110 17c-4.257 0-7.893-2.66-9.336-6.41zM14 10a4 4 0 11-8 0 4 4 0 018 0z"
                                    clipRule="evenodd"
                                />
                            </svg>
                        )}
                    </button>
                </label>
                {displayError && <p className="px-1 text-xs text-red-500">{displayError}</p>}
            </div>
        );
    }
);

PasswordInput.displayName = "PasswordInput";