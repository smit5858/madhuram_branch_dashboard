import { Field, Form, Formik, useFormikContext } from "formik";
import { useEffect, useMemo } from "react";
import { Download, Plus, RotateCcw } from "lucide-react";
import { parse } from "date-fns";
import type { IBranchPaymentOptionsModel } from "@/models/BranchPayment";
import { Input } from "@/components/formik-fields/Input";
import { Select, type SelectOption } from "@/components/formik-fields/Select";
import { DatePicker, DATE_VALUE_FORMAT } from "@/components/formik-fields/DatePicker";
import { Button } from "@/components/Button";
import { useDebounce } from "@/hook/useDebounce";
import { isCompleteDate, productFilterSchema } from "@/validation/validation";
import { ALL, defaultFilters, type BranchPaymentFilterValues } from "./branchPaymentConfig";

const toDate = (value: string) => (isCompleteDate(value) ? parse(value, DATE_VALUE_FORMAT, new Date()) : undefined);

const DIRECTION_OPTIONS: SelectOption[] = [
    { value: "all", label: "Sent & received" },
    { value: "sent", label: "Sent only" },
    { value: "received", label: "Received only" },
];

// Reports filter changes to the parent, debouncing the search text. Dates are only applied
// once complete and in order, so half-typed input never reaches the API.
const FilterWatcher = ({ onChange }: { onChange: (filters: BranchPaymentFilterValues) => void }) => {
    const { values } = useFormikContext<BranchPaymentFilterValues>();
    const search = useDebounce(values.search.trim());
    const startDate = isCompleteDate(values.startDate) ? values.startDate : "";
    const endDate = isCompleteDate(values.endDate) ? values.endDate : "";
    const isPartial = (!!values.startDate && !startDate) || (!!values.endDate && !endDate);
    const isOrdered = !startDate || !endDate || startDate <= endDate;
    const { branchId, direction, status } = values;

    useEffect(() => {
        if (isPartial || !isOrdered) return;
        onChange({ search, branchId, direction, status, startDate, endDate });
    }, [search, branchId, direction, status, startDate, endDate, isPartial, isOrdered, onChange]);

    return null;
};

interface BranchPaymentFiltersProps {
    options: IBranchPaymentOptionsModel;
    /** Starting values; the page re-keys this component to apply a branch picked elsewhere */
    initialValues: BranchPaymentFilterValues;
    onChange: (filters: BranchPaymentFilterValues) => void;
    onAdd: () => void;
    onExport: () => void;
    isExporting: boolean;
}

const BranchPaymentFilters = ({ options, initialValues, onChange, onAdd, onExport, isExporting }: BranchPaymentFiltersProps) => {
    const today = useMemo(() => new Date(), []);

    const branchOptions = useMemo<SelectOption[]>(() => [
        { value: ALL, label: "All branches" },
        ...options.branch.map((b) => ({ value: String(b.id), label: b.isActive ? b.name : `${b.name} (Inactive)` })),
    ], [options.branch]);

    const statusOptions = useMemo<SelectOption[]>(() => [
        { value: ALL, label: "All statuses" },
        ...options.statuses.map((s) => ({ value: s, label: s })),
    ], [options.statuses]);

    return (
        <Formik initialValues={initialValues} validationSchema={productFilterSchema} onSubmit={() => undefined}>
            {({ values, resetForm }) => (
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <Form className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start" noValidate>
                        <FilterWatcher onChange={onChange} />
                        <div className="w-full sm:w-64">
                            <Field id="search" name="search" placeholder="Search branch, reference, BP no..." component={Input} />
                        </div>
                        {options.isAdmin && (
                            <Field id="branchId" name="branchId" options={branchOptions} component={Select} className="w-full sm:w-44" />
                        )}
                        {(!options.isAdmin || values.branchId !== ALL) && (
                            <Field id="direction" name="direction" options={DIRECTION_OPTIONS} component={Select} className="w-full sm:w-44" />
                        )}
                        <Field id="status" name="status" options={statusOptions} component={Select} className="w-full sm:w-40" />
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-2">
                            <Field
                                id="startDate"
                                name="startDate"
                                placeholder="From date"
                                maxDate={toDate(values.endDate) ?? today}
                                component={DatePicker}
                                className="w-full sm:w-44"
                            />
                            <span className="hidden h-10 items-center text-xs text-slate-400 sm:flex">to</span>
                            <Field
                                id="endDate"
                                name="endDate"
                                placeholder="To date"
                                minDate={toDate(values.startDate)}
                                maxDate={today}
                                component={DatePicker}
                                className="w-full sm:w-44"
                            />
                        </div>
                        <Button
                            onClick={() => resetForm({ values: defaultFilters() })}
                            className="sm:w-auto bg-gray-100! text-gray-700! hover:bg-gray-200! focus-visible:ring-gray-400!"
                        >
                            <RotateCcw className="size-4" />
                            Reset
                        </Button>
                    </Form>
                    <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
                        <Button
                            onClick={onExport}
                            loading={isExporting}
                            className="sm:w-auto bg-gray-100! text-gray-700! hover:bg-gray-200! focus-visible:ring-gray-400!"
                        >
                            <Download className="size-4" />
                            Export CSV
                        </Button>
                        <Button className="sm:w-auto" onClick={onAdd}>
                            <Plus className="size-4" />
                            Add Payment
                        </Button>
                    </div>
                </div>
            )}
        </Formik>
    );
};

export default BranchPaymentFilters;
