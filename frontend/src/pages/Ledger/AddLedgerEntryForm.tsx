import { Field, Form, Formik } from "formik";
import { useMemo } from "react";
import { useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import toast from "react-hot-toast";
import { Input } from "@/components/formik-fields/Input";
import { Select, type SelectOption } from "@/components/formik-fields/Select";
import { Textarea } from "@/components/formik-fields/Textarea";
import { DatePicker, DATE_VALUE_FORMAT } from "@/components/formik-fields/DatePicker";
import { Button } from "@/components/Button";
import { Dialog } from "@/components/Dialog";
import { ledgerEntrySchema } from "@/validation/validation";
import type { ILedgerCreateModel, ILedgerEntryModel, ILedgerFormValues, ILedgerOptionsModel } from "@/models/Ledger";
import type { LedgerConfig } from "./ledgerConfig";

interface AddLedgerEntryFormProps {
    config: LedgerConfig;
    open: boolean;
    onClose: () => void;
    onSaved: () => void;
    options: ILedgerOptionsModel;
    /** Branch picked in the page filter; an admin's new entry starts there */
    filterBranchId: number | null;
    /** When set the form edits this entry, otherwise it adds one */
    entry?: ILedgerEntryModel | null;
}

const toOptions = (list: string[] = []): SelectOption[] => list.map((x) => ({ value: x, label: x }));

const AddLedgerEntryForm = ({ config, open, onClose, onSaved, options, filterBranchId, entry }: AddLedgerEntryFormProps) => {
    const isEdit = !!entry;
    const { isAdmin } = options;
    const today = useMemo(() => new Date(), []);
    const schema = useMemo(() => ledgerEntrySchema(config.withPaymentMethod), [config.withPaymentMethod]);

    // New entries go to active branches only; an entry's current branch stays listed while editing
    const branchOptions = useMemo<SelectOption[]>(() => options.branch
        .filter((b) => !isAdmin || b.isActive || b.id === entry?.branchId)
        .map((b) => ({ value: String(b.id), label: b.isActive ? b.name : `${b.name} (Inactive)` })),
    [options.branch, isAdmin, entry]);

    // Members are always on their own branch. An admin starts on the branch picked in the
    // filter, else their own branch (e.g. Rajkot), when it is active.
    const defaultBranchId = useMemo(() => {
        if (!isAdmin) return String(options.branch[0]?.id ?? "");
        const isActive = (id: number | null) => !!id && options.branch.some((b) => b.id === id && b.isActive);
        if (isActive(filterBranchId)) return String(filterBranchId);
        if (isActive(options.ownBranchId)) return String(options.ownBranchId);
        return "";
    }, [isAdmin, options, filterBranchId]);

    const initialValues = useMemo<ILedgerFormValues>(() => ({
        entryDate: entry?.entryDate ?? format(today, DATE_VALUE_FORMAT),
        amount: entry?.amount ?? "",
        category: entry?.category ?? "",
        description: entry?.description ?? "",
        paymentMethod: entry?.paymentMethod ?? (config.withPaymentMethod ? options.paymentMethods?.[0] ?? "" : ""),
        branchId: entry ? String(entry.branchId) : defaultBranchId,
    }), [entry, today, config.withPaymentMethod, options.paymentMethods, defaultBranchId]);

    const { mutate: saveEntry, isPending } = useMutation({
        mutationFn: (values: ILedgerFormValues) => {
            const body: ILedgerCreateModel = {
                entryDate: values.entryDate,
                amount: Number(values.amount),
                category: values.category,
                description: values.description.trim(),
                ...(config.withPaymentMethod && { paymentMethod: values.paymentMethod }),
                branchId: Number(values.branchId),
            };
            return entry ? config.service.update(entry.id, body) : config.service.create(body);
        },
        onSuccess: (response) => {
            // http-service shows its own toast and resolves undefined for handled API errors
            if (response?.data?.status) {
                toast.success(response.data.message || `${config.title} ${isEdit ? "updated" : "added"} successfully`);
                onSaved();
                onClose();
            }
        },
        onError: (error) => {
            toast.error(typeof error === "string" ? error : "Something went wrong");
        },
    });

    return (
        <Dialog open={open} onClose={onClose} title={`${isEdit ? "Edit" : "Add"} ${config.title}`} preventClose={isPending}
            className="max-h-[calc(100dvh-2rem)] overflow-y-auto!">
            {/* Keyed so reopening for another entry starts from that entry's values */}
            <Formik
                key={`${entry?.id ?? "new"}:${open}`}
                initialValues={initialValues}
                validationSchema={schema}
                onSubmit={(values) => saveEntry(values)}
            >
                <Form className="flex flex-col gap-4" noValidate>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="flex flex-col gap-1">
                            <Field
                                id="branchId"
                                name="branchId"
                                label="Branch"
                                options={branchOptions}
                                placeholder="Select branch"
                                disabled={!isAdmin}
                                component={Select}
                            />
                            {isAdmin && branchOptions.length === 0 && (
                                <p className="px-1 text-xs text-red-500">No active branches found. Add a branch first.</p>
                            )}
                        </div>
                        <Field id="entryDate" name="entryDate" label="Date" maxDate={today} component={DatePicker} />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field
                            id="category"
                            name="category"
                            label={config.withPaymentMethod ? "Category" : "Category / Source"}
                            options={toOptions(options.categories)}
                            placeholder="Select category"
                            component={Select}
                        />
                        <Field
                            id="amount"
                            name="amount"
                            type="number"
                            inputMode="decimal"
                            min={0}
                            step="0.01"
                            label="Amount (₹)"
                            placeholder="Enter amount"
                            component={Input}
                        />
                    </div>
                    {config.withPaymentMethod && (
                        <Field
                            id="paymentMethod"
                            name="paymentMethod"
                            label="Payment Method"
                            options={toOptions(options.paymentMethods)}
                            placeholder="Select payment method"
                            component={Select}
                        />
                    )}
                    <Field
                        id="description"
                        name="description"
                        label="Description / Notes"
                        placeholder="Add details (required for Other)"
                        rows={3}
                        component={Textarea}
                    />

                    <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                        <Button
                            onClick={onClose}
                            disabled={isPending}
                            className="sm:w-auto bg-gray-100! text-gray-700! hover:bg-gray-200! focus-visible:ring-gray-400!"
                        >
                            Cancel
                        </Button>
                        <Button type="submit" loading={isPending} className="sm:w-auto">
                            {isEdit ? `Update ${config.title}` : `Save ${config.title}`}
                        </Button>
                    </div>
                </Form>
            </Formik>
        </Dialog>
    );
};

export default AddLedgerEntryForm;
