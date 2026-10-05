import clsx from "clsx";
import { forwardRef } from "react";
import type { FieldInputProps, FormikProps } from "formik";

interface SwitchProps {
    id?: string;
    name?: string;
    label?: string;
    /** Text shown next to the switch for the on / off state, e.g. "Active" / "Inactive". */
    onLabel?: string;
    offLabel?: string;
    checked?: boolean;
    onChange?: (checked: boolean) => void;
    disabled?: boolean;
    className?: string;
    field?: FieldInputProps<boolean>;
    form?: Pick<FormikProps<unknown>, "setFieldValue" | "setFieldTouched">;
}

export const Switch = forwardRef<HTMLButtonElement, SwitchProps>(
    ({ id, name, label, onLabel, offLabel, checked, onChange, disabled, className, field, form }, ref) => {
        const fieldName = field?.name ?? name;
        const isOn = !!(field ? field.value : checked);
        const stateLabel = isOn ? onLabel : offLabel;

        const toggle = () => {
            const next = !isOn;
            if (fieldName && form) {
                form.setFieldValue(fieldName, next, true);
                form.setFieldTouched(fieldName, true, false);
            }
            onChange?.(next);
        };

        return (
            <div
                className={clsx(
                    "flex items-center justify-between gap-3 rounded-xl bg-gray-100 px-3",
                    label ? "h-14" : "h-10",
                    disabled && "opacity-50",
                    className
                )}
            >
                {label && (
                    <label htmlFor={id ?? fieldName} className="text-xs font-medium text-gray-600">
                        {label}
                    </label>
                )}
                <div className="flex items-center gap-2">
                    {stateLabel && (
                        <span className={clsx("text-sm", isOn ? "text-gray-900" : "text-gray-500")}>{stateLabel}</span>
                    )}
                    <button
                        ref={ref}
                        type="button"
                        id={id ?? fieldName}
                        role="switch"
                        aria-checked={isOn}
                        disabled={disabled}
                        onClick={toggle}
                        onBlur={field?.onBlur}
                        name={fieldName}
                        className={clsx(
                            "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors outline-none",
                            "focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2",
                            "disabled:cursor-not-allowed",
                            isOn ? "bg-blue-500" : "bg-gray-300"
                        )}
                    >
                        <span
                            aria-hidden="true"
                            className={clsx(
                                "inline-block size-5 rounded-full bg-white shadow transition-transform",
                                isOn ? "translate-x-5.5" : "translate-x-0.5"
                            )}
                        />
                    </button>
                </div>
            </div>
        );
    }
);

Switch.displayName = "Switch";
