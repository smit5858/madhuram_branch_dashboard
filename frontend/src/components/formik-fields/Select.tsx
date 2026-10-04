import clsx from "clsx";
import { getIn, type FieldInputProps, type FormikProps } from "formik";
import { forwardRef, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import './custom.css'

export interface SelectOption {
    value: string;
    label: string;
    disabled?: boolean;
}

interface SelectProps {
    name?: string;
    label?: string;
    placeholder?: string;
    options?: SelectOption[];
    value?: string;
    onChange?: (value: string) => void;
    error?: string;
    disabled?: boolean;
    className?: string;
    field?: FieldInputProps<string>;
    form?: Pick<FormikProps<unknown>, "errors" | "touched" | "setFieldValue" | "setFieldTouched">;
}

export const Select = forwardRef<HTMLButtonElement, SelectProps>(
    ({ name, label, placeholder, options = [], value, onChange, error, disabled, className, field, form }, ref) => {
        const fieldName = field?.name ?? name;
        const formError = fieldName && form && getIn(form.touched, fieldName)
            ? getIn(form.errors, fieldName)
            : undefined;
        const displayError = error ?? (typeof formError === "string" ? formError : undefined);

        const current = field?.value ?? value ?? "";
        const selected = options.find((o) => o.value === current);

        const [open, setOpen] = useState(false);
        const [activeIndex, setActiveIndex] = useState(-1);
        const wrapperRef = useRef<HTMLDivElement>(null);
        const listRef = useRef<HTMLUListElement>(null);
        const listId = useId();

        const close = () => {
            setOpen(false);
            if (fieldName) form?.setFieldTouched(fieldName, true);
        };

        const openList = () => {
            const idx = options.findIndex((o) => o.value === current);
            setActiveIndex(idx >= 0 ? idx : options.findIndex((o) => !o.disabled));
            setOpen(true);
        };

        const choose = (opt: SelectOption) => {
            if (opt.disabled) return;
            if (fieldName && form) {
                form.setFieldValue(fieldName, opt.value, true);
                form.setFieldTouched(fieldName, true, false);
            }
            onChange?.(opt.value);
            setOpen(false);
        };

        const move = (dir: 1 | -1) => {
            if (!options.length) return;
            let i = activeIndex === -1 ? (dir === 1 ? -1 : 0) : activeIndex;
            for (let n = 0; n < options.length; n++) {
                i = (i + dir + options.length) % options.length;
                if (!options[i].disabled) return setActiveIndex(i);
            }
        };

        const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
            if (!open) {
                if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
                    e.preventDefault();
                    openList();
                }
                return;
            }
            switch (e.key) {
                case "ArrowDown": e.preventDefault(); move(1); break;
                case "ArrowUp": e.preventDefault(); move(-1); break;
                case "Enter":
                case " ":
                    e.preventDefault();
                    if (options[activeIndex]) choose(options[activeIndex]);
                    break;
                case "Escape": e.preventDefault(); close(); break;
                case "Tab": close(); break;
            }
        };

        // Close on outside click
        useEffect(() => {
            if (!open) return;
            const handle = (e: MouseEvent) => {
                if (!wrapperRef.current?.contains(e.target as Node)) {
                    setOpen(false);
                    if (fieldName) form?.setFieldTouched(fieldName, true);
                }
            };
            document.addEventListener("mousedown", handle);
            return () => document.removeEventListener("mousedown", handle);
        }, [open, fieldName, form]);

        // Keep highlighted option in view
        useEffect(() => {
            if (open && activeIndex >= 0) {
                listRef.current?.children[activeIndex]?.scrollIntoView({ block: "nearest" });
            }
        }, [open, activeIndex]);

        return (
            <div className={clsx("flex flex-col gap-1.5", className)}>
                <div ref={wrapperRef} className="relative">
                    <button
                        ref={ref}
                        type="button"
                        id={fieldName}
                        disabled={disabled}
                        role="combobox"
                        aria-haspopup="listbox"
                        aria-expanded={open}
                        aria-controls={listId}
                        aria-activedescendant={open && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
                        aria-invalid={!!displayError}
                        onClick={() => (open ? close() : openList())}
                        onKeyDown={handleKeyDown}
                        className={clsx(
                            "group relative flex w-full flex-col justify-center rounded-xl px-3 text-left outline-none cursor-pointer transition-colors",
                            label ? "h-14" : "h-10",
                            open ? "bg-gray-200" : "bg-gray-100 hover:bg-gray-200",
                            "focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2",
                            "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-gray-100",
                            "aria-invalid:bg-red-50 aria-invalid:hover:bg-red-100"
                        )}
                    >
                        {label && (
                            <span className="text-xs font-medium text-gray-600 group-aria-invalid:text-red-500">
                                {label}
                            </span>
                        )}
                        <span
                            className={clsx(
                                "truncate pr-6 text-sm",
                                selected ? "text-gray-900" : "text-gray-400 group-aria-invalid:text-red-400"
                            )}
                        >
                            {selected?.label ?? placeholder ?? "\u00a0"}
                        </span>
                        <svg
                            viewBox="0 0 20 20"
                            fill="currentColor"
                            aria-hidden="true"
                            className={clsx(
                                "pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 size-4 text-gray-500 transition-transform duration-200 group-aria-invalid:text-red-500",
                                open && "rotate-180"
                            )}
                        >
                            <path
                                fillRule="evenodd"
                                d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                                clipRule="evenodd"
                            />
                        </svg>
                    </button>

                    <ul
                        ref={listRef}
                        id={listId}
                        role="listbox"
                        className={clsx(
                            "absolute left-0 right-0 top-full z-50 mt-2 max-h-60 overflow-auto rounded-xl border border-gray-100 bg-white p-1 shadow-lg shadow-black/5",
                            "origin-top transition duration-150 ease-out",
                            open ? "visible scale-100 opacity-100" : "pointer-events-none invisible scale-95 opacity-0"
                        )}
                    >
                        {options.map((opt, i) => {
                            const isSelected = opt.value === current;
                            return (
                                <li
                                    key={opt.value}
                                    id={`${listId}-${i}`}
                                    role="option"
                                    aria-selected={isSelected}
                                    aria-disabled={opt.disabled}
                                    onMouseDown={(e) => e.preventDefault()}
                                    onMouseEnter={() => !opt.disabled && setActiveIndex(i)}
                                    onClick={() => choose(opt)}
                                    className={clsx(
                                        "flex cursor-pointer items-center justify-between rounded-lg px-2 py-1.5 text-sm transition-colors",
                                        i === activeIndex && "bg-gray-100",
                                        isSelected ? "font-medium text-gray-900" : "text-gray-700",
                                        opt.disabled && "cursor-not-allowed opacity-40"
                                    )}
                                >
                                    {opt.label}
                                    {isSelected && (
                                        <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="size-4">
                                            <path
                                                fillRule="evenodd"
                                                d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
                                                clipRule="evenodd"
                                            />
                                        </svg>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                </div>
                {displayError && <p className="px-1 text-xs text-red-500">{displayError}</p>}
            </div>
        );
    }
);

Select.displayName = "Select";