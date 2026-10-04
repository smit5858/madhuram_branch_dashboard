import clsx from "clsx";
import { forwardRef, type InputHTMLAttributes } from "react";
import { getIn, type FieldInputProps } from "formik";
import './custom.css'

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "form"> {
    error?: string;
    label?: string;
    field?: FieldInputProps<string>;
    form?: { errors: unknown; touched: unknown };
}

export const Input = forwardRef<HTMLInputElement, InputProps>(({ className, error, field, form, label, ...props }, ref) => {
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
                    "group flex w-full flex-col justify-center rounded-xl px-3 cursor-text transition-colors",
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
                    aria-invalid={!!displayError}
                    className="w-full bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400 group-data-[invalid=true]:placeholder:text-red-400 disabled:cursor-not-allowed"
                    {...props}
                />
            </label>
            {displayError && <p className="px-1 text-xs text-red-500">{displayError}</p>}
        </div>
    )
})

Input.displayName = 'Input';