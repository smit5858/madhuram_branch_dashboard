import { Field, Form, Formik } from "formik";
import { useMemo } from "react";
import { useSelector } from "react-redux";
import { useMutation, useQuery } from "@tanstack/react-query";
import { addDays, format, parse } from "date-fns";
import * as Yup from "yup";
import toast from "react-hot-toast";
import { Dialog } from "@/components/Dialog";
import { Button } from "@/components/Button";
import { Input } from "@/components/formik-fields/Input";
import { Select, type SelectOption } from "@/components/formik-fields/Select";
import { Switch } from "@/components/formik-fields/Switch";
import { Textarea } from "@/components/formik-fields/Textarea";
import { DatePicker, DATE_VALUE_FORMAT } from "@/components/formik-fields/DatePicker";
import serialService from "@/services/serial-service";
import { isCompleteDate, MAX_SALE_AMOUNT } from "@/validation/validation";
import { DateToDisplayDate } from "@/util/DateFormate";
import type { RootState } from "@/store/store";
import type { ISerialDetailModel, ISerialOptionsModel } from "@/models/Serial";

export type LicenseAction = "install" | "activate" | "renew" | "deactivate" | "release";

interface LicenseActionDialogProps {
    action: LicenseAction | null;
    unit: ISerialDetailModel;
    onClose: () => void;
    onSaved: () => void;
}

interface Values {
    date: string;
    deviceName: string;
    technicianName: string;
    activate: boolean;
    expiryDate: string;
    amount: number | "";
    reason: string;
    branchId: string;
    note: string;
}

const TITLES: Record<LicenseAction, string> = {
    install: "Record Installation",
    activate: "Activate License",
    renew: "Renew License",
    deactivate: "Cancel / Deactivate",
    release: "Release for Reassignment",
};

const DATE_LABEL: Record<LicenseAction, string> = {
    install: "Installation Date",
    activate: "Activation Date",
    renew: "Renewal Date",
    deactivate: "Cancellation Date",
    release: "",
};

const toDate = (value: string | null | undefined) => (value && isCompleteDate(value) ? parse(value, DATE_VALUE_FORMAT, new Date()) : undefined);
const validDate = (label: string) => Yup.string().required(`${label} is required`).test("valid-date", "Enter a valid date", (v) => !v || isCompleteDate(v));
const optionalDate = () => Yup.string().test("valid-date", "Enter a valid date", (v) => !v || isCompleteDate(v));

// Checks shared with the API; the API checks everything again (dates against the sale,
// installation and current expiry, and who may act)
const schemaFor = (action: LicenseAction, currentExpiry: string | null) => Yup.object({
    date: action === "release" ? Yup.string() : validDate(DATE_LABEL[action]),
    deviceName: Yup.string().trim().max(255, "At most 255 characters"),
    technicianName: Yup.string().trim().max(255, "At most 255 characters"),
    expiryDate: (action === "renew" ? validDate("New expiry date") : optionalDate())
        .test("after-date", "Expiry must be after the date above", function (value) {
            const { date } = this.parent;
            return !value || !isCompleteDate(value) || !isCompleteDate(date) || value > date;
        })
        .test("after-current", `Must be after the current expiry${currentExpiry ? ` (${DateToDisplayDate(currentExpiry)})` : ""}`,
            (value) => action !== "renew" || !value || !currentExpiry || value > currentExpiry),
    amount: Yup.number()
        .typeError("Amount must be a number")
        .min(0, "Amount cannot be negative")
        .max(MAX_SALE_AMOUNT, "Amount is too large")
        .test("two-decimals", "At most 2 decimal places", (v) => v === undefined || /^\d+(\.\d{1,2})?$/.test(String(v))),
    reason: action === "deactivate" ? Yup.string().trim().max(500, "At most 500 characters").required("Reason is required") : Yup.string(),
    note: Yup.string().trim().max(500, "At most 500 characters"),
});

// Install, activate, renew, cancel or release one software license / installation
const LicenseActionDialog = ({ action, unit, onClose, onSaved }: LicenseActionDialogProps) => {
    const userId = useSelector((state: RootState) => state.auth.userId);
    const userName = useSelector((state: RootState) => state.auth.name);
    const today = useMemo(() => new Date(), []);
    const isLicense = unit.productType === "Software";
    const { installation } = unit;

    const { data: options } = useQuery<ISerialOptionsModel>({
        queryKey: ["serial-options", userId],
        queryFn: async () => {
            const response = await serialService.options();
            if (!response?.data?.status) throw new Error("Could not load branches.");
            return response.data.data;
        },
        enabled: action === "release",
        retry: false,
    });
    const branchOptions = useMemo<SelectOption[]>(
        () => (options?.allBranches ?? []).filter((b) => b.isActive).map((b) => ({ value: String(b.id), label: b.name })),
        [options],
    );

    const { mutate: save, isPending } = useMutation({
        mutationFn: (values: Values) => {
            const sn = unit.serialNumber;
            const note = values.note.trim() || undefined;
            switch (action) {
                case "install":
                    return serialService.install({
                        serialNumber: sn,
                        installationDate: values.date,
                        deviceName: values.deviceName.trim() || undefined,
                        technicianName: values.technicianName.trim() || undefined,
                        activate: isLicense ? values.activate : undefined,
                        expiryDate: isLicense && values.activate && values.expiryDate ? values.expiryDate : undefined,
                        note,
                    });
                case "activate":
                    return serialService.activate({ serialNumber: sn, activationDate: values.date, expiryDate: values.expiryDate || undefined, note });
                case "renew":
                    return serialService.renew({ serialNumber: sn, renewalDate: values.date, expiryDate: values.expiryDate, amount: values.amount === "" ? 0 : Number(values.amount), note });
                case "deactivate":
                    return serialService.deactivate({ serialNumber: sn, date: values.date, reason: values.reason.trim() });
                default:
                    return serialService.release({ serialNumber: sn, branchId: values.branchId ? Number(values.branchId) : undefined, note });
            }
        },
        onSuccess: (response) => {
            // http-service shows its own toast and resolves undefined for handled API errors
            if (response?.data?.status) {
                toast.success(response.data.message || "Saved");
                onSaved();
                onClose();
            }
        },
        onError: (error) => toast.error(typeof error === "string" ? error : "Something went wrong"),
    });

    if (!action) return null;

    // Earliest allowed date for each action
    const minDate = action === "install" ? toDate(unit.currentHolder?.saleDate)
        : action === "activate" ? toDate(installation.installationDate)
            : action === "renew" ? toDate(installation.activationDate) : undefined;
    const initialValues: Values = {
        date: format(today, DATE_VALUE_FORMAT),
        deviceName: "",
        technicianName: userName ?? "",
        activate: isLicense,
        expiryDate: "",
        amount: "",
        reason: "",
        branchId: unit.branchId ? String(unit.branchId) : "",
        note: "",
    };

    return (
        <Dialog open={!!action} onClose={onClose} title={TITLES[action]} preventClose={isPending} className="max-w-xl!">
            <Formik initialValues={initialValues} validationSchema={schemaFor(action, installation.expiryDate)} onSubmit={(values) => save(values)}>
                {({ values }) => (
                    <Form className="flex flex-col gap-4" noValidate>
                        <p className="text-sm text-slate-600">
                            <span className="font-semibold text-slate-800">{unit.serialNumber}</span> · {unit.productName}
                            {unit.currentHolder && <> · {unit.currentHolder.customerName}</>}
                        </p>

                        {action !== "release" && (
                            <Field id="date" name="date" label={DATE_LABEL[action]} minDate={minDate} maxDate={today} component={DatePicker} />
                        )}

                        {action === "install" && (
                            <>
                                <div className="grid gap-4 sm:grid-cols-2">
                                    <Field id="deviceName" name="deviceName" label="Device / Machine" placeholder="e.g. Workshop laptop, VIN, device ID" component={Input} />
                                    <Field id="technicianName" name="technicianName" label="Technician" placeholder="Who installed it" component={Input} />
                                </div>
                                {isLicense && (
                                    <Field id="activate" name="activate" label="Activate the license now" onLabel="Yes" offLabel="No, activate later" component={Switch} />
                                )}
                            </>
                        )}

                        {((action === "install" && isLicense && values.activate) || action === "activate" || action === "renew") && (
                            <Field
                                id="expiryDate"
                                name="expiryDate"
                                label={action === "renew" ? "New Expiry Date" : "Expiry Date (optional)"}
                                minDate={toDate(values.date) ? addDays(toDate(values.date)!, 1) : undefined}
                                component={DatePicker}
                            />
                        )}
                        {action === "renew" && (
                            <>
                                <p className="-mt-2 px-1 text-xs text-slate-500">
                                    Current expiry: <span className="font-semibold text-slate-700">{installation.expiryDate ? DateToDisplayDate(installation.expiryDate) : "none"}</span>
                                </p>
                                <Field id="amount" name="amount" type="number" inputMode="decimal" min={0} step="0.01" label="Renewal Amount (₹)" placeholder="0 for a free renewal" component={Input} />
                                <p className="-mt-2 px-1 text-xs text-slate-500">A paid renewal is saved as a Renewal sale for the same customer, so it counts in sales revenue. Deleting that sale cancels the renewal.</p>
                            </>
                        )}

                        {action === "deactivate" && (
                            <>
                                <Field id="reason" name="reason" label="Reason" placeholder="e.g. Subscription stopped, license revoked" rows={3} component={Textarea} />
                                <p className="-mt-2 px-1 text-xs text-slate-500">
                                    {isLicense
                                        ? unit.licenseReassignable
                                            ? "The license is deactivated. An admin can later release it for reassignment."
                                            : "The license is deactivated for good: its terms don't allow reassignment."
                                        : "The installation is cancelled. Its sale stays in the history; record a return to refund the customer."}
                                </p>
                            </>
                        )}

                        {action === "release" && (
                            <>
                                <Field id="branchId" name="branchId" label="License Pool (Branch)" placeholder="Select branch" options={branchOptions} component={Select} />
                                <p className="-mt-2 px-1 text-xs text-slate-500">The license becomes available to sell to a new customer. Its earlier sales stay in the history.</p>
                            </>
                        )}

                        {action !== "deactivate" && <Field id="note" name="note" label="Note (optional)" rows={2} component={Textarea} />}

                        <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                            <Button
                                onClick={onClose}
                                disabled={isPending}
                                className="sm:w-auto bg-gray-100! text-gray-700! hover:bg-gray-200! focus-visible:ring-gray-400!"
                            >
                                Cancel
                            </Button>
                            <Button type="submit" loading={isPending} className={action === "deactivate" ? "sm:w-auto bg-red-500! hover:bg-red-600! focus-visible:ring-red-500!" : "sm:w-auto"}>
                                {TITLES[action]}
                            </Button>
                        </div>
                    </Form>
                )}
            </Formik>
        </Dialog>
    );
};

export default LicenseActionDialog;
