import { Field, Form, Formik, useFormikContext } from "formik";
import { useEffect, useMemo } from "react";
import { Plus, RotateCcw } from "lucide-react";
import { parse } from "date-fns";
import type { ILedgerOptionsModel } from "@/models/Ledger";
import { Input } from "@/components/formik-fields/Input";
import { Select, type SelectOption } from "@/components/formik-fields/Select";
import { DatePicker, DATE_VALUE_FORMAT } from "@/components/formik-fields/DatePicker";
import { Button } from "@/components/Button";
import { useDebounce } from "@/hook/useDebounce";
import { isCompleteDate, productFilterSchema } from "@/validation/validation";
import { ALL, defaultFilters, type LedgerConfig, type LedgerFilterValues } from "./ledgerConfig";

const YEARS_BACK = 9;

const MONTH_OPTIONS: SelectOption[] = [
    { value: ALL, label: "All months" },
    ...["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
        .map((label, i) => ({ value: String(i + 1), label })),
];

const PERIOD_OPTIONS: SelectOption[] = [
    { value: "month", label: "Month / Year" },
    { value: "range", label: "Date range" },
];

const toDate = (value: string) => (isCompleteDate(value) ? parse(value, DATE_VALUE_FORMAT, new Date()) : undefined);

// Reports filter changes to the parent, debouncing the search text. Dates are only applied
// once complete and in order, so half-typed input never reaches the API.
const FilterWatcher = ({ onChange }: { onChange: (filters: LedgerFilterValues) => void }) => {
    const { values } = useFormikContext<LedgerFilterValues>();
    const search = useDebounce(values.search.trim());
    const startDate = isCompleteDate(values.startDate) ? values.startDate : "";
    const endDate = isCompleteDate(values.endDate) ? values.endDate : "";
    // A typed but incomplete date keeps the last applied range instead of clearing it
    const isPartial = values.period === "range" && ((!!values.startDate && !startDate) || (!!values.endDate && !endDate));
    const isOrdered = !startDate || !endDate || startDate <= endDate;
    const { branchId, category, period, month, year } = values;

    useEffect(() => {
        if (isPartial || !isOrdered) return;
        onChange({ search, branchId, category, period, month, year, startDate, endDate });
    }, [search, branchId, category, period, month, year, startDate, endDate, isPartial, isOrdered, onChange]);

    return null;
};

interface LedgerFiltersProps {
    config: LedgerConfig;
    options: ILedgerOptionsModel;
    onChange: (filters: LedgerFilterValues) => void;
    onAdd: () => void;
}

const LedgerFilters = ({ config, options, onChange, onAdd }: LedgerFiltersProps) => {
    const today = useMemo(() => new Date(), []);
    const initialValues = useMemo(() => defaultFilters(), []);

    const yearOptions = useMemo<SelectOption[]>(() => {
        const current = today.getFullYear();
        return Array.from({ length: YEARS_BACK + 1 }, (_, i) => ({ value: String(current - i), label: String(current - i) }));
    }, [today]);

    const branchOptions = useMemo<SelectOption[]>(() => [
        { value: ALL, label: "All branches" },
        ...options.branch.map((b) => ({ value: String(b.id), label: b.isActive ? b.name : `${b.name} (Inactive)` })),
    ], [options.branch]);

    const categoryOptions = useMemo<SelectOption[]>(() => [
        { value: ALL, label: "All categories" },
        // Income: narrows the totals to product sales from the Sales module
        ...(options.salesCategory ? [{ value: options.salesCategory, label: `${options.salesCategory} (from Sales)` }] : []),
        ...options.categories.map((c) => ({ value: c, label: c })),
    ], [options.categories, options.salesCategory]);

    return (
        <Formik initialValues={initialValues} validationSchema={productFilterSchema} onSubmit={() => undefined}>
            {({ values, resetForm }) => (
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <Form className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start" noValidate>
                        <FilterWatcher onChange={onChange} />
                        <div className="w-full sm:w-64">
                            <Field id="search" name="search" placeholder="Search description or category..." component={Input} />
                        </div>
                        {options.isAdmin && (
                            <Field id="branchId" name="branchId" options={branchOptions} component={Select} className="w-full sm:w-44" />
                        )}
                        <Field id="category" name="category" options={categoryOptions} component={Select} className="w-full sm:w-48" />
                        <Field id="period" name="period" options={PERIOD_OPTIONS} component={Select} className="w-full sm:w-40" />
                        {values.period === "month" ? (
                            <div className="flex gap-2">
                                <Field id="month" name="month" options={MONTH_OPTIONS} component={Select} className="w-full sm:w-40" />
                                <Field id="year" name="year" options={yearOptions} component={Select} className="w-full sm:w-28" />
                            </div>
                        ) : (
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-2">
                                <Field
                                    id="startDate"
                                    name="startDate"
                                    maxDate={toDate(values.endDate) ?? today}
                                    component={DatePicker}
                                    className="w-full sm:w-44"
                                />
                                <span className="hidden h-10 items-center text-xs text-slate-400 sm:flex">to</span>
                                <Field
                                    id="endDate"
                                    name="endDate"
                                    minDate={toDate(values.startDate)}
                                    maxDate={today}
                                    component={DatePicker}
                                    className="w-full sm:w-44"
                                />
                            </div>
                        )}
                        <Button
                            onClick={() => resetForm({ values: defaultFilters() })}
                            className="sm:w-auto bg-gray-100! text-gray-700! hover:bg-gray-200! focus-visible:ring-gray-400!"
                        >
                            <RotateCcw className="size-4" />
                            Reset
                        </Button>
                    </Form>
                    <Button className="shrink-0 lg:w-auto" onClick={onAdd}>
                        <Plus className="size-4" />
                        Add {config.title}
                    </Button>
                </div>
            )}
        </Formik>
    );
};

export default LedgerFilters;
