import clsx from "clsx";
import { getIn, type FieldInputProps, type FormikProps } from "formik";
import {
    forwardRef, useCallback, useEffect, useRef, useState,
    type ClipboardEvent, type FocusEvent, type KeyboardEvent, type MouseEvent,
} from "react";
import { DayPicker, type Matcher } from "react-day-picker";
import {
    addMonths, addYears, endOfMonth, format, getDaysInMonth, isAfter, isBefore,
    isValid, parse, startOfMonth, subMonths, subYears,
} from "date-fns";
import 'react-day-picker/style.css'
import './DatePicker.css'

/** Format the value is stored in (and read from) Formik. */
export const DATE_VALUE_FORMAT = "yyyy-MM-dd";

type Segment = "d" | "m" | "y";
type Parts = Record<Segment, string>;

interface DatePickerProps {
    name?: string;
    label?: string;
    placeholder?: string;
    value?: string;
    onChange?: (value: string) => void;
    error?: string;
    disabled?: boolean;
    className?: string;
    minDate?: Date;
    maxDate?: Date;
    /** Order of the typed segments: day/month/year (default) or month/day/year. */
    dateOrder?: "dmy" | "mdy";
    field?: FieldInputProps<string>;
    form?: Pick<FormikProps<unknown>, "errors" | "touched" | "setFieldValue" | "setFieldTouched">;
}

const EMPTY_PARTS: Parts = { d: "", m: "", y: "" };
const SEGMENT_LENGTH: Record<Segment, number> = { d: 2, m: 2, y: 4 };
const SEGMENT_PLACEHOLDER: Record<Segment, string> = { d: "dd", m: "mm", y: "yyyy" };
const SEGMENT_LABEL: Record<Segment, string> = { d: "Day", m: "Month", y: "Year" };
const SEPARATOR_KEYS = ["/", "-", ".", " "];

const parseValue = (value: string): Date | undefined => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
    const date = parse(value, DATE_VALUE_FORMAT, new Date());
    return isValid(date) ? date : undefined;
};

const partsFromValue = (value: string): Parts => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    return match ? { y: match[1], m: match[2], d: match[3] } : EMPTY_PARTS;
};

const partsFromDate = (date: Date): Parts => partsFromValue(format(date, DATE_VALUE_FORMAT));

// Partial or impossible input (e.g. "2026-02-31") is stored as-is so Yup reports it as invalid.
const valueFromParts = (p: Parts) => (!p.d && !p.m && !p.y ? "" : `${p.y}-${p.m}-${p.d}`);

const pad = (segment: Segment, text: string) =>
    segment !== "y" && text.length === 1 && text !== "0" ? `0${text}` : text;

/** Parses pasted text like "15/10/2026", "15-10-2026" or "2026-10-15". */
const partsFromPaste = (text: string, order: Segment[]): Parts | undefined => {
    const iso = parseValue(text.trim());
    if (iso) return partsFromDate(iso);
    const nums = text.trim().split(/[^\d]+/).filter(Boolean);
    if (nums.length !== 3) return undefined;
    const parts = { ...EMPTY_PARTS };
    order.forEach((seg, i) => { parts[seg] = pad(seg, nums[i]).slice(0, SEGMENT_LENGTH[seg]); });
    return parts;
};

const clampToRange = (date: Date, start: Date, end: Date) =>
    isBefore(date, start) ? start : isAfter(date, end) ? end : date;

export const DatePicker = forwardRef<HTMLInputElement, DatePickerProps>(
    ({ name, label, placeholder, value, onChange, error, disabled, className, minDate, maxDate, dateOrder = "dmy", field, form }, ref) => {
        const fieldName = field?.name ?? name;
        const formError = fieldName && form && getIn(form.touched, fieldName)
            ? getIn(form.errors, fieldName)
            : undefined;
        const displayError = error ?? (typeof formError === "string" ? formError : undefined);

        const order: Segment[] = dateOrder === "mdy" ? ["m", "d", "y"] : ["d", "m", "y"];
        const startMonth = startOfMonth(minDate ?? subYears(new Date(), 100));
        const endMonth = endOfMonth(maxDate ?? addYears(new Date(), 10));

        // Typed segments live locally; Formik gets "yyyy-MM-dd" (or the partial text, which fails
        // validation). Resync only when the stored value changes from outside (e.g. resetForm).
        const current = field?.value ?? value ?? "";
        const [parts, setParts] = useState<Parts>(() => partsFromValue(current));
        const [emitted, setEmitted] = useState(current);
        if (current !== emitted) {
            setEmitted(current);
            setParts(partsFromValue(current));
        }
        const selected = parseValue(valueFromParts(parts));

        const [open, setOpen] = useState(false);
        const [month, setMonth] = useState<Date>(() => selected ?? new Date());
        const wrapperRef = useRef<HTMLDivElement>(null);
        const buttonRef = useRef<HTMLButtonElement>(null);
        const segmentRefs = useRef<Record<Segment, HTMLInputElement | null>>({ d: null, m: null, y: null });

        const setFirstSegmentRef = useCallback((el: HTMLInputElement | null) => {
            if (typeof ref === "function") ref(el);
            else if (ref) ref.current = el;
        }, [ref]);

        const markTouched = () => {
            if (fieldName) form?.setFieldTouched(fieldName, true);
        };

        const commit = (next: Parts) => {
            const nextValue = valueFromParts(next);
            setParts(next);
            setEmitted(nextValue);
            if (fieldName && form) form.setFieldValue(fieldName, nextValue, true);
            onChange?.(nextValue);
        };

        const focusSegment = (segment: Segment | undefined) => {
            const el = segment && segmentRefs.current[segment];
            if (el) { el.focus(); el.select(); }
        };
        const neighbour = (segment: Segment, dir: 1 | -1) => order[order.indexOf(segment) + dir];

        // ---- typed entry ----
        const handleSegmentChange = (segment: Segment, raw: string) => {
            let text = raw.replace(/\D/g, "").slice(0, SEGMENT_LENGTH[segment]);
            const first = Number(text[0]);
            const advance =
                text.length === SEGMENT_LENGTH[segment] ||
                (text.length === 1 && ((segment === "d" && first > 3) || (segment === "m" && first > 1)));
            if (advance) text = pad(segment, text);
            commit({ ...parts, [segment]: text });
            if (advance && segment !== "y") focusSegment(neighbour(segment, 1));
        };

        const step = (segment: Segment, dir: 1 | -1) => {
            const today = new Date();
            const fallback = { d: today.getDate(), m: today.getMonth() + 1, y: today.getFullYear() }[segment];
            const n = parts[segment] ? Number(parts[segment]) + dir : fallback;
            let text: string;
            if (segment === "y") {
                text = String(Math.min(9999, Math.max(1, n))).padStart(4, "0");
            } else {
                const max = segment === "m"
                    ? 12
                    : parts.m && parts.y.length === 4
                        ? getDaysInMonth(new Date(Number(parts.y), Number(parts.m) - 1))
                        : 31;
                text = String(n < 1 ? max : n > max ? 1 : n).padStart(2, "0");
            }
            commit({ ...parts, [segment]: text });
        };

        const handleSegmentKeyDown = (segment: Segment, e: KeyboardEvent<HTMLInputElement>) => {
            const input = e.currentTarget;
            const atStart = input.selectionStart === 0 && input.selectionEnd === 0;
            const atEnd = input.selectionStart === input.value.length;
            if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                e.preventDefault();
                step(segment, e.key === "ArrowUp" ? 1 : -1);
            } else if (e.key === "ArrowLeft" && atStart) {
                e.preventDefault();
                focusSegment(neighbour(segment, -1));
            } else if (e.key === "ArrowRight" && atEnd) {
                e.preventDefault();
                focusSegment(neighbour(segment, 1));
            } else if (e.key === "Backspace" && input.value === "") {
                e.preventDefault();
                focusSegment(neighbour(segment, -1));
            } else if (SEPARATOR_KEYS.includes(e.key)) {
                e.preventDefault();
                if (parts[segment]) {
                    commit({ ...parts, [segment]: pad(segment, parts[segment]) });
                    focusSegment(neighbour(segment, 1));
                }
            } else if (e.key === "Enter" && e.altKey) {
                e.preventDefault();
                toggleCalendar();
            }
        };

        // Reads the DOM value: auto-advance moves focus inside onChange, so this blur fires
        // before `parts` has re-rendered with the digit that was just typed.
        const handleSegmentBlur = (segment: Segment, text: string) => {
            const padded = pad(segment, text);
            if (padded !== text) commit({ ...parts, [segment]: padded });
        };

        const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
            const pasted = partsFromPaste(e.clipboardData.getData("text"), order);
            if (!pasted) return;
            e.preventDefault();
            commit(pasted);
            focusSegment("y");
        };

        // Clicking empty space in the box focuses the first unfilled segment
        const handleBoxClick = (e: MouseEvent<HTMLDivElement>) => {
            if (disabled || (e.target instanceof Element && e.target.closest("input, button"))) return;
            focusSegment(order.find((s) => !parts[s]) ?? order[0]);
        };

        // Leaving the whole control (inputs + calendar) marks it touched
        const handleWrapperBlur = (e: FocusEvent<HTMLDivElement>) => {
            if (!(e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget))) markTouched();
        };

        // ---- calendar ----
        const openCalendar = () => {
            setMonth(clampToRange(selected ?? new Date(), startMonth, endMonth));
            setOpen(true);
        };

        const closeCalendar = () => {
            setOpen(false);
            markTouched();
        };

        function toggleCalendar() {
            if (open) closeCalendar();
            else openCalendar();
        }

        const chooseDate = (date: Date) => {
            commit(partsFromDate(date));
            setOpen(false);
            buttonRef.current?.focus();
        };

        const handleWrapperKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
            if (open && e.key === "Escape") {
                e.preventDefault();
                closeCalendar();
                buttonRef.current?.focus();
            }
        };

        // Close on outside click
        useEffect(() => {
            if (!open) return;
            const handle = (e: globalThis.MouseEvent) => {
                if (!wrapperRef.current?.contains(e.target as Node)) {
                    setOpen(false);
                    if (fieldName) form?.setFieldTouched(fieldName, true);
                }
            };
            document.addEventListener("mousedown", handle);
            return () => document.removeEventListener("mousedown", handle);
        }, [open, fieldName, form]);

        const disabledDays: Matcher[] = [];
        if (minDate) disabledDays.push({ before: minDate });
        if (maxDate) disabledDays.push({ after: maxDate });

        return (
            <div className={clsx("flex flex-col gap-1.5", className)}>
                <div ref={wrapperRef} className="relative" onKeyDown={handleWrapperKeyDown} onBlur={handleWrapperBlur}>
                    <div
                        role="group"
                        aria-labelledby={label && fieldName ? `${fieldName}-label` : undefined}
                        onClick={handleBoxClick}
                        data-invalid={!!displayError}
                        className={clsx(
                            "group relative flex w-full flex-col justify-center rounded-xl px-3 pr-10 cursor-text transition-colors",
                            label ? "h-14" : "h-10",
                            open ? "bg-gray-200" : "bg-gray-100 hover:bg-gray-200 focus-within:bg-gray-100",
                            "has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50 has-[:disabled]:hover:bg-gray-100",
                            "data-[invalid=true]:bg-red-50 data-[invalid=true]:hover:bg-red-100 data-[invalid=true]:focus-within:bg-red-50"
                        )}
                    >
                        {label && (
                            <label
                                id={fieldName ? `${fieldName}-label` : undefined}
                                htmlFor={fieldName}
                                className="text-xs font-medium text-gray-600 cursor-text group-data-[invalid=true]:text-red-500"
                            >
                                {label}
                            </label>
                        )}
                        <div className="-ml-0.5 flex items-center text-sm tabular-nums">
                            {order.map((segment, i) => (
                                <span key={segment} className="flex items-center">
                                    {i > 0 && <span className="px-0.5 text-gray-400 group-data-[invalid=true]:text-red-400">/</span>}
                                    <input
                                        ref={(el) => {
                                            segmentRefs.current[segment] = el;
                                            if (i === 0) setFirstSegmentRef(el);
                                        }}
                                        id={i === 0 ? fieldName : undefined}
                                        name={fieldName ? `${fieldName}.${segment}` : undefined}
                                        type="text"
                                        inputMode="numeric"
                                        autoComplete="off"
                                        aria-label={SEGMENT_LABEL[segment]}
                                        aria-invalid={!!displayError}
                                        placeholder={SEGMENT_PLACEHOLDER[segment]}
                                        value={parts[segment]}
                                        disabled={disabled}
                                        onChange={(e) => handleSegmentChange(segment, e.target.value)}
                                        onKeyDown={(e) => handleSegmentKeyDown(segment, e)}
                                        onFocus={(e) => e.target.select()}
                                        onBlur={(e) => handleSegmentBlur(segment, e.target.value)}
                                        onPaste={handlePaste}
                                        className={clsx(
                                            "rounded-md bg-transparent px-0.5 text-center text-gray-900 outline-none transition-colors",
                                            // empty segments are sized for their "dd"/"mm"/"yyyy" placeholder
                                            segment === "y"
                                                ? parts.y ? "w-[4.75ch]" : "w-[5ch]"
                                                : parts[segment] ? "w-[2.9ch]" : "w-[3.7ch]",
                                            "placeholder:text-gray-400 group-data-[invalid=true]:placeholder:text-red-400",
                                            "focus:bg-gray-200 group-data-[invalid=true]:focus:bg-red-100",
                                            "disabled:cursor-not-allowed"
                                        )}
                                    />
                                </span>
                            ))}
                        </div>
                        <button
                            ref={buttonRef}
                            type="button"
                            disabled={disabled}
                            aria-label={open ? "Close calendar" : "Open calendar"}
                            aria-haspopup="dialog"
                            aria-expanded={open}
                            onClick={toggleCalendar}
                            className={clsx(
                                "absolute right-2 top-1/2 -translate-y-1/2 flex size-7 items-center justify-center rounded-lg cursor-pointer transition-colors",
                                "text-gray-500 hover:bg-gray-300/60 hover:text-gray-700 outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
                                "group-data-[invalid=true]:text-red-500 group-data-[invalid=true]:hover:bg-red-200/60",
                                "disabled:cursor-not-allowed disabled:hover:bg-transparent"
                            )}
                        >
                            <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="size-4">
                                <path
                                    fillRule="evenodd"
                                    d="M5.75 2a.75.75 0 01.75.75V4h7V2.75a.75.75 0 011.5 0V4h.25A2.75 2.75 0 0118 6.75v8.5A2.75 2.75 0 0115.25 18H4.75A2.75 2.75 0 012 15.25v-8.5A2.75 2.75 0 014.75 4H5V2.75A.75.75 0 015.75 2zm-1 5.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-6.5c0-.69-.56-1.25-1.25-1.25H4.75z"
                                    clipRule="evenodd"
                                />
                            </svg>
                        </button>
                    </div>

                    {open && (
                        <div
                            role="dialog"
                            aria-label={label ?? placeholder ?? "Choose date"}
                            className="date-field__popover absolute left-0 top-full z-50 mt-2 rounded-2xl border border-gray-100 bg-white p-3 shadow-lg shadow-black/10"
                        >
                            <CalendarPanel
                                selected={selected}
                                month={month}
                                onMonthChange={setMonth}
                                onSelect={chooseDate}
                                startMonth={startMonth}
                                endMonth={endMonth}
                                disabledDays={disabledDays}
                            />
                        </div>
                    )}
                </div>
                {displayError && <p className="px-1 text-xs text-red-500">{displayError}</p>}
            </div>
        );
    }
);

DatePicker.displayName = "DatePicker";

interface CalendarPanelProps {
    selected: Date | undefined;
    month: Date;
    onMonthChange: (month: Date) => void;
    onSelect: (date: Date) => void;
    startMonth: Date;
    endMonth: Date;
    disabledDays: Matcher[];
}

const MONTH_NAMES = Array.from({ length: 12 }, (_, i) => format(new Date(2000, i, 1), "MMM"));

/** Day grid with a clickable "October 2026 ›" header that switches to year, then month, pickers. */
const CalendarPanel = ({ selected, month, onMonthChange, onSelect, startMonth, endMonth, disabledDays }: CalendarPanelProps) => {
    const [view, setView] = useState<"days" | "years" | "months">("days");
    const activeYearRef = useRef<HTMLButtonElement>(null);
    const today = new Date();
    const year = month.getFullYear();

    useEffect(() => {
        if (view === "years") activeYearRef.current?.scrollIntoView({ block: "center" });
    }, [view]);

    const canGoBack = isAfter(startOfMonth(month), startMonth);
    const canGoForward = isBefore(endOfMonth(month), endMonth);
    const years = Array.from(
        { length: endMonth.getFullYear() - startMonth.getFullYear() + 1 },
        (_, i) => startMonth.getFullYear() + i
    );

    const pickYear = (y: number) => {
        onMonthChange(clampToRange(new Date(y, month.getMonth(), 1), startMonth, endMonth));
        setView("months");
    };

    const pickMonth = (m: number) => {
        onMonthChange(new Date(year, m, 1));
        setView("days");
    };

    const navButton = "flex size-8 items-center justify-center rounded-full text-blue-500 transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:text-gray-300 disabled:hover:bg-transparent outline-none focus-visible:ring-2 focus-visible:ring-blue-500";
    const cell = "rounded-full py-2 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-35";

    return (
        <div className="w-74">
            <div className="mb-1 flex h-9 items-center justify-between pl-1">
                <button
                    type="button"
                    onClick={() => setView(view === "days" ? "years" : "days")}
                    aria-label={view === "days" ? "Choose month and year" : "Back to calendar"}
                    className="flex items-center gap-1 rounded-lg px-1.5 py-1 text-sm font-semibold text-gray-900 transition-colors hover:bg-gray-100 outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                    {view === "years" ? `${year}` : format(month, "MMMM yyyy")}
                    <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className={clsx("size-4 text-blue-500 transition-transform duration-200", view !== "days" && "rotate-90")}>
                        <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                    </svg>
                </button>
                {view === "days" && (
                    <div className="flex items-center gap-0.5">
                        <button type="button" aria-label="Previous month" disabled={!canGoBack} onClick={() => onMonthChange(subMonths(month, 1))} className={navButton}>
                            <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="size-5">
                                <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clipRule="evenodd" />
                            </svg>
                        </button>
                        <button type="button" aria-label="Next month" disabled={!canGoForward} onClick={() => onMonthChange(addMonths(month, 1))} className={navButton}>
                            <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="size-5">
                                <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                            </svg>
                        </button>
                    </div>
                )}
            </div>

            {view === "days" && (
                <DayPicker
                    mode="single"
                    required
                    selected={selected}
                    onSelect={onSelect}
                    month={month}
                    onMonthChange={onMonthChange}
                    startMonth={startMonth}
                    endMonth={endMonth}
                    disabled={disabledDays}
                    hideNavigation
                    showOutsideDays
                    formatters={{ formatWeekdayName: (d) => format(d, "EEE") }}
                    classNames={{ month_caption: "hidden" }}
                    className="date-field__calendar"
                />
            )}

            {view === "years" && (
                <div className="grid max-h-68 grid-cols-4 gap-1 overflow-y-auto pr-1">
                    {years.map((y) => {
                        const isActive = y === year;
                        return (
                            <button
                                key={y}
                                ref={isActive ? activeYearRef : undefined}
                                type="button"
                                onClick={() => pickYear(y)}
                                className={clsx(
                                    cell,
                                    isActive
                                        ? "bg-blue-500 font-medium text-white"
                                        : y === today.getFullYear()
                                            ? "bg-blue-50 font-medium text-blue-600 hover:bg-blue-100"
                                            : "text-gray-900 hover:bg-gray-100"
                                )}
                            >
                                {y}
                            </button>
                        );
                    })}
                </div>
            )}

            {view === "months" && (
                <div className="grid grid-cols-3 gap-2 py-2">
                    {MONTH_NAMES.map((m, i) => {
                        const outOfRange = isBefore(endOfMonth(new Date(year, i, 1)), startMonth) || isAfter(new Date(year, i, 1), endMonth);
                        const isActive = i === month.getMonth();
                        const isCurrent = i === today.getMonth() && year === today.getFullYear();
                        return (
                            <button
                                key={m}
                                type="button"
                                disabled={outOfRange}
                                onClick={() => pickMonth(i)}
                                className={clsx(
                                    cell,
                                    "py-3",
                                    isActive
                                        ? "bg-blue-500 font-medium text-white"
                                        : isCurrent
                                            ? "bg-blue-50 font-medium text-blue-600 hover:bg-blue-100"
                                            : "text-gray-900 hover:bg-gray-100"
                                )}
                            >
                                {m}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
