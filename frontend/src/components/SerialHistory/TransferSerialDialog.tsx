import { Field, Form, Formik } from "formik";
import { useMemo } from "react";
import { useSelector } from "react-redux";
import { useMutation, useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import toast from "react-hot-toast";
import { Dialog } from "@/components/Dialog";
import { Button } from "@/components/Button";
import { Select, type SelectOption } from "@/components/formik-fields/Select";
import { Textarea } from "@/components/formik-fields/Textarea";
import { DatePicker, DATE_VALUE_FORMAT } from "@/components/formik-fields/DatePicker";
import serialService from "@/services/serial-service";
import { serialTransferSchema } from "@/validation/validation";
import type { RootState } from "@/store/store";
import type { ISerialOptionsModel } from "@/models/Serial";

interface TransferSerialDialogProps {
    open: boolean;
    serialNumber: string;
    productName: string;
    fromBranchId: number | null;
    fromBranchName: string | null;
    onClose: () => void;
    onSaved: () => void;
}

interface TransferFormValues {
    toBranchId: string;
    transferDate: string;
    note: string;
}

// Admins only: moves one in-stock unit (and one unit of stock) to another branch
const TransferSerialDialog = ({ open, serialNumber, productName, fromBranchId, fromBranchName, onClose, onSaved }: TransferSerialDialogProps) => {
    const userId = useSelector((state: RootState) => state.auth.userId);
    const today = useMemo(() => new Date(), []);

    const { data: options } = useQuery<ISerialOptionsModel>({
        queryKey: ["serial-options", userId],
        queryFn: async () => {
            const response = await serialService.options();
            if (!response?.data?.status) throw new Error("Could not load branches.");
            return response.data.data;
        },
        enabled: open,
        retry: false,
    });

    const branchOptions = useMemo<SelectOption[]>(
        () => (options?.allBranches ?? [])
            .filter((b) => b.isActive && b.id !== fromBranchId)
            .map((b) => ({ value: String(b.id), label: b.name })),
        [options, fromBranchId],
    );

    const { mutate: transfer, isPending } = useMutation({
        mutationFn: (values: TransferFormValues) => serialService.transfer({
            serialNumber,
            toBranchId: Number(values.toBranchId),
            transferDate: values.transferDate,
            note: values.note.trim() || undefined,
        }),
        onSuccess: (response) => {
            // http-service shows its own toast and resolves undefined for handled API errors
            if (response?.data?.status) {
                toast.success(response.data.message || "Transferred");
                onSaved();
                onClose();
            }
        },
        onError: (error) => toast.error(typeof error === "string" ? error : "Something went wrong"),
    });

    return (
        <Dialog open={open} onClose={onClose} title="Transfer to Another Branch" preventClose={isPending}>
            <Formik
                initialValues={{ toBranchId: "", transferDate: format(today, DATE_VALUE_FORMAT), note: "" }}
                validationSchema={serialTransferSchema}
                onSubmit={(values) => transfer(values)}
            >
                <Form className="flex flex-col gap-4" noValidate>
                    <p className="text-sm text-slate-600">
                        Move <span className="font-semibold text-slate-800">{serialNumber}</span> ({productName}) out of{" "}
                        <span className="font-semibold text-slate-800">{fromBranchName ?? "its branch"}</span>. Both branches' stock counts are updated and the move is kept in the history.
                    </p>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field
                            id="toBranchId"
                            name="toBranchId"
                            label="To Branch"
                            placeholder={options ? "Select branch" : "Loading..."}
                            options={branchOptions}
                            component={Select}
                        />
                        <Field id="transferDate" name="transferDate" label="Transfer Date" maxDate={today} component={DatePicker} />
                    </div>
                    <Field id="note" name="note" label="Note (optional)" placeholder="e.g. Courier / vehicle details" rows={2} component={Textarea} />
                    {options && branchOptions.length === 0 && <p className="text-xs text-red-500">No other active branch to transfer to.</p>}
                    <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                        <Button
                            onClick={onClose}
                            disabled={isPending}
                            className="sm:w-auto bg-gray-100! text-gray-700! hover:bg-gray-200! focus-visible:ring-gray-400!"
                        >
                            Cancel
                        </Button>
                        <Button type="submit" loading={isPending} className="sm:w-auto">Transfer</Button>
                    </div>
                </Form>
            </Formik>
        </Dialog>
    );
};

export default TransferSerialDialog;
