import { Field, Form, Formik, useFormikContext } from "formik";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { format, parse } from "date-fns";
import toast from "react-hot-toast";
import { Dialog } from "@/components/Dialog";
import { Button } from "@/components/Button";
import { Input } from "@/components/formik-fields/Input";
import { Select, type SelectOption } from "@/components/formik-fields/Select";
import { Textarea } from "@/components/formik-fields/Textarea";
import { DatePicker, DATE_VALUE_FORMAT } from "@/components/formik-fields/DatePicker";
import serialService from "@/services/serial-service";
import saleReturnService from "@/services/sale-return-service";
import { saleReturnSchema } from "@/validation/validation";
import { DateToDisplayDate } from "@/util/DateFormate";
import type { RootState } from "@/store/store";
import type { ISaleReturnOptionsModel } from "@/models/SaleReturn";
import type { ISerialOptionsModel } from "@/models/Serial";
import { formatMoney, OTHER_BRANCH_CUSTOMER, SERIAL_STATUS_LABEL } from "./serialDisplay";

/** The sale being returned against, and the units of it that can still be returned */
export interface ReturnTarget {
    saleId: number;
    saleReference: string;
    customerName: string;
    /** yyyy-MM-dd */
    saleDate: string;
    branchId: number | null;
    branchName: string | null;
    /** amount: the unit's share of the sale, when known */
    units: { serialNumber: string; amount: number | null }[];
}

interface RecordReturnDialogProps {
    open: boolean;
    /** null: the user first looks the unit up by its serial number */
    target: ReturnTarget | null;
    onClose: () => void;
    onSaved: () => void;
}

interface ReturnFormValues {
    serialNumber: string;
    returnDate: string;
    condition: string;
    refundAmount: number | "";
    reason: string;
    branchId: string;
}

// The refund starts at the picked unit's selling amount (a full refund) and follows the pick
const RefundSync = ({ units }: { units: ReturnTarget["units"] }) => {
    const { values, setFieldValue } = useFormikContext<ReturnFormValues>();
    const previous = useRef(values.serialNumber);

    useEffect(() => {
        if (values.serialNumber === previous.current) return;
        previous.current = values.serialNumber;
        const amount = units.find((u) => u.serialNumber === values.serialNumber)?.amount;
        setFieldValue("refundAmount", amount ?? "", false);
    }, [values.serialNumber, units, setFieldValue]);

    return null;
};

// Finds the sale a serial number is currently on, for recording a return without opening Sales
const SerialLookup = ({ onFound }: { onFound: (target: ReturnTarget) => void }) => {
    const [serialNumber, setSerialNumber] = useState("");
    const [problem, setProblem] = useState<string | null>(null);

    const { mutate: lookUp, isPending } = useMutation({
        mutationFn: (sn: string) => serialService.detail(sn),
        onSuccess: (response) => {
            // http-service has already toasted "Serial number not found" and resolves undefined
            if (!response?.data?.status) return;
            const unit = response.data.data;
            const holder = unit.currentHolder;
            if (unit.status !== "Sold" || !holder) {
                setProblem(`${unit.serialNumber} is ${SERIAL_STATUS_LABEL[unit.status].toLowerCase()}, so there is no sale to return it against.`);
                return;
            }
            if (holder.customerName === OTHER_BRANCH_CUSTOMER) {
                setProblem(`${unit.serialNumber} was sold by another branch. Only that branch or an admin can record its return.`);
                return;
            }
            onFound({
                saleId: holder.saleId,
                saleReference: holder.saleReference,
                customerName: holder.customerName,
                saleDate: holder.saleDate,
                branchId: unit.branchId,
                branchName: unit.branchName,
                units: [{ serialNumber: unit.serialNumber, amount: unit.sales.find((s) => s.saleId === holder.saleId)?.amount ?? null }],
            });
        },
        onError: () => toast.error("Something went wrong"),
    });

    const submit = () => {
        const value = serialNumber.trim();
        setProblem(null);
        if (value) lookUp(value);
    };

    return (
        <div className="flex flex-col gap-3">
            <p className="text-sm text-slate-600">Enter the serial number of the unit the customer brought back.</p>
            <div className="flex flex-col gap-2 sm:flex-row">
                <div className="flex-1">
                    <Input
                        name="lookupSerial"
                        placeholder="Serial number, e.g. TNM12345"
                        value={serialNumber}
                        autoFocus
                        onChange={(e) => setSerialNumber(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                e.preventDefault();
                                submit();
                            }
                        }}
                    />
                </div>
                <Button onClick={submit} loading={isPending} disabled={!serialNumber.trim()} className="sm:w-auto">
                    <Search className="size-4" />
                    Find Sale
                </Button>
            </div>
            {problem && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{problem}</p>}
        </div>
    );
};

const ReturnForm = ({ target, onClose, onSaved }: { target: ReturnTarget; onClose: () => void; onSaved: () => void }) => {
    const userId = useSelector((state: RootState) => state.auth.userId);
    const today = useMemo(() => new Date(), []);

    const { data: returnOptions } = useQuery<ISaleReturnOptionsModel>({
        queryKey: ["sale-return-options", userId],
        queryFn: async () => {
            const response = await saleReturnService.options();
            if (!response?.data?.status) throw new Error("Could not load return options.");
            return response.data.data;
        },
        retry: false,
    });
    const { data: serialOptions } = useQuery<ISerialOptionsModel>({
        queryKey: ["serial-options", userId],
        queryFn: async () => {
            const response = await serialService.options();
            if (!response?.data?.status) throw new Error("Could not load branches.");
            return response.data.data;
        },
        retry: false,
    });
    const isAdmin = !!serialOptions?.isAdmin;

    // Admins pick any active branch to receive the unit; members always receive into their own
    const branchOptions = useMemo<SelectOption[]>(
        () => (serialOptions?.branch ?? []).filter((b) => b.isActive).map((b) => ({ value: String(b.id), label: b.name })),
        [serialOptions],
    );
    const conditionOptions = useMemo<SelectOption[]>(
        () => (returnOptions?.conditions ?? []).map((c) => ({ value: c, label: c })),
        [returnOptions],
    );
    const unitOptions = useMemo<SelectOption[]>(
        () => target.units.map((u) => ({ value: u.serialNumber, label: u.amount === null ? u.serialNumber : `${u.serialNumber} · ${formatMoney(u.amount)}` })),
        [target.units],
    );

    const first = target.units.length === 1 ? target.units[0] : null;
    const initialValues: ReturnFormValues = {
        serialNumber: first?.serialNumber ?? "",
        returnDate: format(today, DATE_VALUE_FORMAT),
        condition: "",
        refundAmount: first?.amount ?? "",
        reason: "",
        branchId: isAdmin
            ? (target.branchId !== null ? String(target.branchId) : "")
            : String(serialOptions?.branchId ?? ""),
    };

    const { mutate: saveReturn, isPending } = useMutation({
        mutationFn: (values: ReturnFormValues) => saleReturnService.create({
            saleId: target.saleId,
            serialNumber: values.serialNumber,
            returnDate: values.returnDate,
            reason: values.reason.trim(),
            condition: values.condition,
            refundAmount: values.refundAmount === "" ? 0 : Number(values.refundAmount),
            ...(isAdmin && { branchId: Number(values.branchId) }),
        }),
        onSuccess: (response) => {
            // http-service shows its own toast and resolves undefined for handled API errors
            if (response?.data?.status) {
                toast.success(response.data.message || "Return recorded");
                onSaved();
                onClose();
            }
        },
        onError: (error) => toast.error(typeof error === "string" ? error : "Something went wrong"),
    });

    if (!returnOptions || !serialOptions) {
        return <div className="h-64 w-full animate-pulse rounded-xl bg-slate-100" />;
    }

    return (
        <Formik
            initialValues={initialValues}
            validationSchema={saleReturnSchema}
            // The refund limit depends on which unit is picked; the API checks it again
            validate={(values) => {
                const max = target.units.find((u) => u.serialNumber === values.serialNumber)?.amount ?? null;
                return max !== null && values.refundAmount !== "" && Number(values.refundAmount) > max
                    ? { refundAmount: `Refund can't be more than the unit's selling amount (${formatMoney(max)})` }
                    : {};
            }}
            onSubmit={(values) => saveReturn(values)}
        >
            {({ values }) => {
                const maxRefund = target.units.find((u) => u.serialNumber === values.serialNumber)?.amount ?? null;
                return (
                    <Form className="flex flex-col gap-4" noValidate>
                        <RefundSync units={target.units} />
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="font-semibold text-slate-800">{target.saleReference}</span>
                                <span className="text-xs text-slate-500">Sold {DateToDisplayDate(target.saleDate)}{target.branchName ? ` · ${target.branchName}` : ""}</span>
                            </div>
                            <p className="mt-1 text-slate-600">Customer: <span className="font-medium text-slate-800">{target.customerName}</span></p>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                            <Field
                                id="serialNumber"
                                name="serialNumber"
                                label="Serial Number"
                                placeholder="Select serial number"
                                options={unitOptions}
                                disabled={unitOptions.length === 1}
                                component={Select}
                            />
                            <Field
                                id="returnDate"
                                name="returnDate"
                                label="Return Date"
                                minDate={parse(target.saleDate, DATE_VALUE_FORMAT, new Date())}
                                maxDate={today}
                                component={DatePicker}
                            />
                            <Field
                                id="condition"
                                name="condition"
                                label="Condition"
                                placeholder="Select condition"
                                options={conditionOptions}
                                component={Select}
                            />
                            <Field
                                id="refundAmount"
                                name="refundAmount"
                                type="number"
                                inputMode="decimal"
                                min={0}
                                step="0.01"
                                label={maxRefund === null ? "Refund / Adjustment (₹)" : `Refund / Adjustment (max ${formatMoney(maxRefund)})`}
                                placeholder="0"
                                component={Input}
                            />
                            {isAdmin ? (
                                <Field
                                    id="branchId"
                                    name="branchId"
                                    label="Receiving Branch"
                                    placeholder="Select branch"
                                    options={branchOptions}
                                    component={Select}
                                />
                            ) : (
                                <p className="self-center px-1 text-xs text-slate-500">
                                    Received into your branch: <span className="font-semibold text-slate-700">{serialOptions.branch[0]?.name}</span>
                                </p>
                            )}
                        </div>
                        <Field
                            id="reason"
                            name="reason"
                            label="Return Reason"
                            placeholder="Why is the customer returning it?"
                            rows={3}
                            component={Textarea}
                        />
                        <p className="-mt-2 px-1 text-xs text-slate-500">
                            The original sale stays in the history. The unit can't be sold again until an admin restocks it.
                        </p>

                        <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                            <Button
                                onClick={onClose}
                                disabled={isPending}
                                className="sm:w-auto bg-gray-100! text-gray-700! hover:bg-gray-200! focus-visible:ring-gray-400!"
                            >
                                Cancel
                            </Button>
                            <Button type="submit" loading={isPending} className="sm:w-auto">Record Return</Button>
                        </div>
                    </Form>
                );
            }}
        </Formik>
    );
};

const RecordReturnDialog = ({ open, target, onClose, onSaved }: RecordReturnDialogProps) => {
    // Set by the lookup step when no target was passed in
    const [found, setFound] = useState<ReturnTarget | null>(null);
    const active = target ?? found;

    const close = () => {
        setFound(null);
        onClose();
    };

    return (
        <Dialog open={open} onClose={close} title="Record Customer Return" className="max-w-2xl!">
            {active
                ? <ReturnForm target={active} onClose={close} onSaved={onSaved} />
                : <SerialLookup onFound={setFound} />}
        </Dialog>
    );
};

export default RecordReturnDialog;
