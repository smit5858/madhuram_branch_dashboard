import { Field, Form, Formik } from "formik";
import { useMemo, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import toast from "react-hot-toast";
import { Input } from "@/components/formik-fields/Input";
import { Select, type SelectOption } from "@/components/formik-fields/Select";
import { Textarea } from "@/components/formik-fields/Textarea";
import { DatePicker, DATE_VALUE_FORMAT } from "@/components/formik-fields/DatePicker";
import { Button } from "@/components/Button";
import { Dialog } from "@/components/Dialog";
import { branchPaymentSchema } from "@/validation/validation";
import { branchPaymentService } from "@/services/branch-payment-service";
import type { IBranchPaymentCreateModel, IBranchPaymentFormValues, IBranchPaymentModel, IBranchPaymentOptionsModel } from "@/models/BranchPayment";
import { newRequestKey } from "./branchPaymentConfig";

interface AddBranchPaymentFormProps {
    open: boolean;
    onClose: () => void;
    onSaved: () => void;
    options: IBranchPaymentOptionsModel;
    /** When set the form edits this payment, otherwise it adds one */
    payment?: IBranchPaymentModel | null;
}

const toOptions = (list: string[] = []): SelectOption[] => list.map((x) => ({ value: x, label: x }));

// Add / edit a branch payment. Members always pay from their own branch and their payments start
// Pending; the API checks every rule and the branch access again.
const AddBranchPaymentForm = ({ open, onClose, onSaved, options, payment }: AddBranchPaymentFormProps) => {
    const isEdit = !!payment;
    const { isAdmin } = options;
    const today = useMemo(() => new Date(), []);
    const isCorrection = payment?.status === "Completed";
    const schema = useMemo(() => branchPaymentSchema(options.referenceRequired, isCorrection), [options.referenceRequired, isCorrection]);
    // One key per opened form: a double click or a retry after a lost response saves the payment once
    const requestKey = useRef(newRequestKey());

    // New payments use active branches only; a payment's current branches stay listed while editing
    const branchOptions = useMemo<SelectOption[]>(() => options.branch
        .filter((b) => b.isActive || b.id === payment?.fromBranchId || b.id === payment?.toBranchId)
        .map((b) => ({ value: String(b.id), label: b.isActive ? b.name : `${b.name} (Inactive)` })),
    [options.branch, payment]);

    const initialValues = useMemo<IBranchPaymentFormValues>(() => ({
        paymentDate: payment?.paymentDate ?? format(today, DATE_VALUE_FORMAT),
        fromBranchId: payment ? String(payment.fromBranchId) : !isAdmin && options.ownBranchId ? String(options.ownBranchId) : "",
        toBranchId: payment ? String(payment.toBranchId) : "",
        amount: payment?.amount ?? "",
        paymentMethod: payment?.paymentMethod ?? "",
        referenceNumber: payment?.referenceNumber ?? "",
        status: payment?.status ?? "Pending",
        notes: payment?.notes ?? "",
        reason: "",
    }), [payment, today, isAdmin, options.ownBranchId]);

    const { mutate: savePayment, isPending } = useMutation({
        mutationFn: (values: IBranchPaymentFormValues) => {
            const body: IBranchPaymentCreateModel = {
                paymentDate: values.paymentDate,
                fromBranchId: Number(values.fromBranchId),
                toBranchId: Number(values.toBranchId),
                amount: Number(values.amount),
                paymentMethod: values.paymentMethod,
                referenceNumber: values.referenceNumber.trim(),
                notes: values.notes.trim(),
            };
            return payment
                ? branchPaymentService.update(payment.id, { ...body, reason: values.reason.trim() })
                : branchPaymentService.create({ ...body, status: values.status as IBranchPaymentCreateModel["status"], requestKey: requestKey.current });
        },
        onSuccess: (response) => {
            // http-service shows its own toast and resolves undefined for handled API errors
            if (response?.data?.status) {
                toast.success(response.data.message || `Payment ${isEdit ? "updated" : "added"} successfully`);
                requestKey.current = newRequestKey();
                onSaved();
                onClose();
            }
        },
        onError: (error) => {
            toast.error(typeof error === "string" ? error : "Something went wrong");
        },
    });

    return (
        <Dialog open={open} onClose={onClose} title={isEdit ? `Edit Payment ${payment.paymentNo}` : "Add Branch Payment"} preventClose={isPending}
            className="max-w-2xl! max-h-[calc(100dvh-2rem)] overflow-y-auto!">
            {/* Keyed so reopening for another payment starts from its values */}
            <Formik
                key={`${payment?.id ?? "new"}:${open}`}
                initialValues={initialValues}
                validationSchema={schema}
                onSubmit={(values) => { if (!isPending) savePayment(values); }}
            >
                {({ values }) => (
                    <Form className="flex flex-col gap-4" noValidate>
                        {isCorrection && (
                            <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
                                This payment is completed. Your correction changes the branch totals right away and is recorded in the payment's history with your reason.
                            </p>
                        )}
                        <div className="grid gap-4 sm:grid-cols-2">
                            <Field
                                id="fromBranchId"
                                name="fromBranchId"
                                label="Paying Branch (sends money)"
                                options={branchOptions}
                                placeholder="Select paying branch"
                                disabled={!isAdmin}
                                component={Select}
                            />
                            <Field
                                id="toBranchId"
                                name="toBranchId"
                                label="Receiving Branch"
                                options={branchOptions.filter((b) => b.value !== values.fromBranchId)}
                                placeholder="Select receiving branch"
                                component={Select}
                            />
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <Field id="paymentDate" name="paymentDate" label="Payment Date" maxDate={today} component={DatePicker} />
                            <Field
                                id="amount"
                                name="amount"
                                type="number"
                                inputMode="decimal"
                                min={0}
                                step="0.01"
                                label="Payment Amount (₹)"
                                placeholder="Enter amount"
                                component={Input}
                            />
                        </div>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <Field
                                id="paymentMethod"
                                name="paymentMethod"
                                label="Payment Method"
                                options={toOptions(options.paymentMethods)}
                                placeholder="Select payment method"
                                component={Select}
                            />
                            <Field
                                id="referenceNumber"
                                name="referenceNumber"
                                label={options.referenceRequired.includes(values.paymentMethod) ? "Cheque Number" : "Transaction / Reference No. (optional)"}
                                placeholder={values.paymentMethod === "Cash" ? "Receipt / voucher no." : "UTR, transaction or cheque no."}
                                component={Input}
                            />
                        </div>
                        {!isEdit && (
                            options.createStatuses.length > 1 ? (
                                <Field
                                    id="status"
                                    name="status"
                                    label="Payment Status"
                                    options={toOptions(options.createStatuses)}
                                    component={Select}
                                />
                            ) : (
                                <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
                                    Saved as <span className="font-semibold">Pending</span>. It counts toward the totals once the receiving branch (or an admin) confirms it.
                                </p>
                            )
                        )}
                        <Field
                            id="notes"
                            name="notes"
                            label="Notes / Description (optional)"
                            placeholder="Purpose of the payment, who handed it over, ..."
                            rows={3}
                            component={Textarea}
                        />
                        {isCorrection && (
                            <Field
                                id="reason"
                                name="reason"
                                label="Reason for correction"
                                placeholder="Why is this completed payment being changed?"
                                rows={2}
                                component={Textarea}
                            />
                        )}

                        <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                            <Button
                                onClick={onClose}
                                disabled={isPending}
                                className="sm:w-auto bg-gray-100! text-gray-700! hover:bg-gray-200! focus-visible:ring-gray-400!"
                            >
                                Cancel
                            </Button>
                            <Button type="submit" loading={isPending} className="sm:w-auto">
                                {isEdit ? "Update Payment" : "Save Payment"}
                            </Button>
                        </div>
                    </Form>
                )}
            </Formik>
        </Dialog>
    );
};

export default AddBranchPaymentForm;
