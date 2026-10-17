import { useEffect, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Field, Form, Formik, useFormikContext } from "formik";
import { Hash, RefreshCw, RotateCcw, Wallet } from "lucide-react";
import toast from "react-hot-toast";
import type { IRajkotExpenseBalanceFormValues, IRajkotExpenseSummaryModel } from "@/models/RajkotExpense";
import type { RootState } from "@/store/store";
import rajkotExpenseService from "@/services/rajkot-expense-service";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Dialog } from "@/components/Dialog";
import { Button } from "@/components/Button";
import { Input } from "@/components/formik-fields/Input";
import { Select, type SelectOption } from "@/components/formik-fields/Select";
import { rajkotExpenseBalanceSchema } from "@/validation/validation";
import { DateToDateTimeString } from "@/util/DateFormate";
import { currency } from "@/pages/Ledger/ledgerConfig";

interface RajkotExpenseCounterProps {
    isAdmin: boolean;
    /** Branch the page is narrowed to; null for an admin's all-branches view */
    branchId: number | null;
    branchName: string | null;
    /** Bumped by the page after an entry is added or accepted so the counter reloads */
    refreshKey: number;
    /** Called after a reset or balance update so the page reloads with it */
    onChanged: () => void;
}

const actionButton = "sm:w-auto h-9! rounded-lg! px-3! text-xs! sm:text-sm!";

// Latest of the branches' timestamps, for "Last reset" / "Last updated"
const latest = (dates: (string | null)[]) => dates.filter(Boolean).sort().at(-1) ?? null;

// The count and balance stored by the API for the branch in view (or every branch), with the
// admin-only Reset Count and Update Balance actions. Both ask for confirmation first and only
// change the numbers once the API has saved the change.
const RajkotExpenseCounter = ({ isAdmin, branchId, branchName, refreshKey, onChanged }: RajkotExpenseCounterProps) => {
    const userId = useSelector((state: RootState) => state.auth.userId);
    const [confirm, setConfirm] = useState<"reset" | "balance" | null>(null);
    const scopeLabel = branchName ?? "all branches";
    const target = branchId ? { branchId } : {};

    const { data, isPending, isError, refetch, isFetching } = useQuery<IRajkotExpenseSummaryModel>({
        queryKey: ["rajkot-expense-summary", userId, branchId, refreshKey],
        queryFn: async () => {
            const response = await rajkotExpenseService.summary(branchId ?? undefined);
            // http-service has already toasted the API's message and resolves undefined
            if (!response?.data?.status) throw new Error("Could not load the expense count.");
            return response.data.data;
        },
        placeholderData: (previous) => previous,
        retry: false,
    });

    const { mutate: resetCount, isPending: isResetting } = useMutation({
        mutationFn: () => rajkotExpenseService.resetCount(target),
        onSuccess: (response) => {
            if (response?.data?.status) {
                toast.success(response.data.message || "Expense count reset to 0");
                setConfirm(null);
                onChanged();
            }
        },
        onError: (error) => toast.error(typeof error === "string" ? error : "Could not reset the count"),
    });

    const { mutate: updateBalance, isPending: isUpdating } = useMutation({
        mutationFn: (values: IRajkotExpenseBalanceFormValues) =>
            rajkotExpenseService.updateBalance({ branchId: Number(values.branchId), balance: Number(values.balance) }),
        onSuccess: (response) => {
            if (response?.data?.status) {
                toast.success(`${response.data.message || "Balance updated successfully"}: ${currency.format(response.data.data.balance)}`);
                setConfirm(null);
                onChanged();
            }
        },
        onError: (error) => toast.error(typeof error === "string" ? error : "Could not update the balance"),
    });

    const busy = isResetting || isUpdating;
    const outOfStep = !!data && Math.round(data.balance * 100) !== Math.round(data.calculatedBalance * 100);
    const lastReset = data ? latest(data.branch.map((b) => b.countResetAt)) : null;

    return (
        <section aria-label="Rajkot expense count and balance" className="flex w-full flex-col gap-3 lg:w-auto lg:items-end">
            <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto">
                <div className="flex flex-1 items-center gap-3 rounded-2xl border border-rose-100 bg-linear-to-br from-rose-50 to-white px-4 py-3 shadow-sm sm:min-w-56">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-600"><Hash className="size-5" /></span>
                    <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-wide text-rose-700">Total Expense Count</p>
                        {isPending ? (
                            <div className="mt-1 h-7 w-16 animate-pulse rounded bg-rose-100" />
                        ) : isError || !data ? (
                            <button type="button" onClick={() => refetch()} disabled={isFetching} className="text-xs text-red-500 underline">Could not load. Retry</button>
                        ) : (
                            <p className="text-2xl font-bold tabular-nums text-slate-900" aria-live="polite">{data.count.toLocaleString("en-IN")}</p>
                        )}
                        <p className="truncate text-xs text-slate-500" title={lastReset ? `Last reset ${DateToDateTimeString(lastReset)}` : undefined}>
                            {data ? `${data.pendingEntries.toLocaleString("en-IN")} pending · ${branchName ?? "All branches"}` : " "}
                        </p>
                    </div>
                </div>
                <div className="flex flex-1 items-center gap-3 rounded-2xl border border-slate-200 bg-linear-to-br from-slate-50 to-white px-4 py-3 shadow-sm sm:min-w-56">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600"><Wallet className="size-5" /></span>
                    <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Balance</p>
                        {isPending ? (
                            <div className="mt-1 h-7 w-24 animate-pulse rounded bg-slate-100" />
                        ) : (
                            <p className="text-2xl font-bold tabular-nums text-slate-900" aria-live="polite">{data ? currency.format(data.balance) : "—"}</p>
                        )}
                        <p className={outOfStep ? "text-xs text-amber-600" : "text-xs text-slate-500"}>
                            {outOfStep ? `Accepted total is ${currency.format(data!.calculatedBalance)}` : "Total of accepted entries"}
                        </p>
                    </div>
                </div>
            </div>

            {isAdmin && (
                <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-end">
                    <Button
                        onClick={() => setConfirm("reset")}
                        disabled={busy || !data}
                        loading={isResetting}
                        className={`${actionButton} bg-white! text-rose-600! ring-1 ring-rose-200 hover:bg-rose-50! disabled:hover:bg-white!`}
                    >
                        {!isResetting && <RotateCcw className="size-4" />} Reset Count
                    </Button>
                    <Button onClick={() => setConfirm("balance")} disabled={busy || !data} loading={isUpdating} className={actionButton}>
                        {!isUpdating && <RefreshCw className="size-4" />} Update Balance
                    </Button>
                </div>
            )}

            <ConfirmDialog
                open={confirm === "reset"}
                onClose={() => setConfirm(null)}
                onConfirm={() => resetCount()}
                loading={isResetting}
                title="Reset Expense Count"
                confirmLabel="Confirm Reset"
                message={
                    <div className="flex flex-col gap-2">
                        <p>
                            The expense count for <span className="font-semibold text-gray-900">{scopeLabel}</span> will be reset from{" "}
                            <span className="font-semibold text-gray-900">{data?.count.toLocaleString("en-IN") ?? 0}</span> to{" "}
                            <span className="font-semibold text-gray-900">0</span>.
                        </p>
                        <p>Expense entries, products, serial numbers, stock and the balance are not changed.</p>
                    </div>
                }
            />

            <Dialog open={confirm === "balance"} onClose={() => setConfirm(null)} title="Update Balance" preventClose={isUpdating} className="max-w-md">
                {data && (
                    <Formik
                        initialValues={balanceInitialValues(data, branchId)}
                        validationSchema={rajkotExpenseBalanceSchema}
                        onSubmit={(values) => updateBalance(values)}
                    >
                        <Form className="flex flex-col gap-4" noValidate>
                            <BalanceFields summary={data} lockBranch={!!branchId} />
                            <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                                <Button
                                    onClick={() => setConfirm(null)}
                                    disabled={isUpdating}
                                    className="sm:w-auto bg-gray-100! text-gray-700! hover:bg-gray-200! focus-visible:ring-gray-400!"
                                >
                                    Cancel
                                </Button>
                                <Button type="submit" loading={isUpdating} className="sm:w-auto">
                                    Confirm Update
                                </Button>
                            </div>
                        </Form>
                    </Formik>
                )}
            </Dialog>
        </section>
    );
};

// Starts on the branch in view (else the first one) with its accepted total filled in
const balanceInitialValues = (summary: IRajkotExpenseSummaryModel, branchId: number | null): IRajkotExpenseBalanceFormValues => {
    const branch = summary.branch.find((b) => b.branchId === branchId) ?? summary.branch[0];
    return { branchId: branch ? String(branch.branchId) : "", balance: branch ? branch.calculatedBalance : "" };
};

// Branch and amount of the balance to save. Picking another branch fills in that branch's
// accepted total, which the admin can change before saving.
const BalanceFields = ({ summary, lockBranch }: { summary: IRajkotExpenseSummaryModel; lockBranch: boolean }) => {
    const { values, setFieldValue } = useFormikContext<IRajkotExpenseBalanceFormValues>();
    const branch = summary.branch.find((b) => String(b.branchId) === values.branchId);
    const branchOptions: SelectOption[] = summary.branch.map((b) => ({ value: String(b.branchId), label: b.branchName }));

    const previousBranch = useRef(values.branchId);
    useEffect(() => {
        if (values.branchId === previousBranch.current) return;
        previousBranch.current = values.branchId;
        if (branch) setFieldValue("balance", branch.calculatedBalance, false);
    }, [values.branchId, branch, setFieldValue]);

    return (
        <>
            <Field id="branchId" name="branchId" label="Branch" options={branchOptions} placeholder="Select branch" disabled={lockBranch} component={Select} />
            <Field
                id="balance"
                name="balance"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                label="Balance (₹)"
                placeholder="Enter balance"
                autoFocus
                component={Input}
            />
            {branch && (
                <div className="flex flex-col gap-1 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    <span>Current balance: <span className="font-semibold text-slate-900">{currency.format(branch.balance)}</span></span>
                    <span>Total of accepted entries: <span className="font-semibold text-slate-900">{currency.format(branch.calculatedBalance)}</span></span>
                    {branch.balanceUpdatedAt && <span>Last updated {DateToDateTimeString(branch.balanceUpdatedAt)}</span>}
                </div>
            )}
            <p className="text-xs text-slate-500">
                The amount entered is saved as this branch's balance. Other branches, the expense count and entries are not changed.
                Entries accepted later are added to it.
            </p>
        </>
    );
};

export default RajkotExpenseCounter;
