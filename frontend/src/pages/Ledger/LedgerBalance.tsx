import { useEffect, useRef, useState } from "react";
import { useSelector } from "react-redux";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Field, Form, Formik, useFormikContext } from "formik";
import { RefreshCw, RotateCcw, Wallet } from "lucide-react";
import clsx from "clsx";
import toast from "react-hot-toast";
import type { ILedgerBalanceFormValues, ILedgerBalanceModel } from "@/models/Ledger";
import type { RootState } from "@/store/store";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Dialog } from "@/components/Dialog";
import { Button } from "@/components/Button";
import { Input } from "@/components/formik-fields/Input";
import { Select, type SelectOption } from "@/components/formik-fields/Select";
import { ledgerBalanceSchema } from "@/validation/validation";
import { DateToDateTimeString } from "@/util/DateFormate";
import { currency, type LedgerConfig } from "./ledgerConfig";

interface LedgerBalanceProps {
    config: LedgerConfig;
    /** Branch the page is narrowed to; null for an admin's all-branches view */
    branchId: number | null;
    branchName: string | null;
    /** Bumped by the page after an entry is saved or deleted so the calculated balance reloads */
    refreshKey: number;
}

const actionButton = "sm:w-auto h-9! rounded-lg! px-3! text-xs! sm:text-sm!";

// Latest of the branches' timestamps, for "Last updated"
const latest = (dates: (string | null)[]) => dates.filter(Boolean).sort().at(-1) ?? null;

// The Total Balance stored by the API for this module and the branch in view (or every branch),
// with Update Balance and Reset Balance. The API says which of them the user may use and checks
// it again. Both ask for confirmation and only change the number once the API has saved it.
const LedgerBalance = ({ config, branchId, branchName, refreshKey }: LedgerBalanceProps) => {
    const userId = useSelector((state: RootState) => state.auth.userId);
    const [confirm, setConfirm] = useState<"update" | "reset" | null>(null);

    const { data, isPending, isError, refetch, isFetching } = useQuery<ILedgerBalanceModel>({
        queryKey: [`${config.kind}-balance`, userId, branchId, refreshKey],
        queryFn: async () => {
            const response = await config.service.balance(branchId ?? undefined);
            // http-service has already toasted the API's message and resolves undefined
            if (!response?.data?.status) throw new Error(`Could not load the ${config.noun} balance.`);
            return response.data.data;
        },
        placeholderData: (previous) => previous,
        retry: false,
    });

    const afterChange = () => {
        setConfirm(null);
        refetch();
    };

    // Admins save the amount entered for the branch picked; members can't set an amount, so their
    // own branch's balance is recalculated from the records
    const { mutate: updateBalance, isPending: isUpdating } = useMutation({
        mutationFn: (values: ILedgerBalanceFormValues) => config.service.updateBalance(
            data?.canSetAmount ? { branchId: Number(values.branchId), balance: Number(values.balance) } : {},
        ),
        onSuccess: (response) => {
            // http-service shows its own toast and resolves undefined for handled API errors
            if (response?.data?.status) {
                toast.success(`${response.data.message || "Balance updated successfully"}: ${currency.format(response.data.data.balance)}`);
                afterChange();
            }
        },
        onError: (error) => toast.error(typeof error === "string" ? error : "Could not update the balance"),
    });

    const { mutate: resetBalance, isPending: isResetting } = useMutation({
        mutationFn: (id: number) => config.service.resetBalance({ branchId: id }),
        onSuccess: (response) => {
            if (response?.data?.status) {
                toast.success(response.data.message || "Balance reset to 0");
                afterChange();
            }
        },
        onError: (error) => toast.error(typeof error === "string" ? error : "Could not reset the balance"),
    });

    const busy = isUpdating || isResetting;
    const outOfStep = !!data && Math.round(data.balance * 100) !== Math.round(data.calculatedBalance * 100);
    const lastUpdated = data ? latest(data.branch.map((b) => b.balanceUpdatedAt)) : null;
    // A reset is for one branch at a time
    const canReset = !!data?.canReset && !!branchId;

    return (
        <section aria-label={`${config.title} total balance`} className="flex w-full flex-col gap-3 lg:w-auto lg:items-end">
            <div className={clsx("flex w-full items-center gap-3 rounded-2xl border bg-linear-to-br to-white px-4 py-3 shadow-sm lg:w-auto lg:min-w-72", config.accent.card)}>
                <span className={clsx("flex size-10 shrink-0 items-center justify-center rounded-xl", config.accent.icon)}><Wallet className="size-5" /></span>
                <div className="min-w-0">
                    <p className={clsx("text-xs font-semibold uppercase tracking-wide", config.accent.label)}>Total Balance</p>
                    {isPending ? (
                        <div className="mt-1 h-7 w-28 animate-pulse rounded bg-slate-100" />
                    ) : isError || !data ? (
                        <button type="button" onClick={() => refetch()} disabled={isFetching} className="text-xs text-red-500 underline">Could not load. Retry</button>
                    ) : (
                        <p className="text-2xl font-bold tabular-nums text-slate-900" aria-live="polite">{currency.format(data.balance)}</p>
                    )}
                    <p
                        className={clsx("truncate text-xs", outOfStep ? "text-amber-600" : "text-slate-500")}
                        title={lastUpdated ? `Last updated ${DateToDateTimeString(lastUpdated)}` : undefined}
                    >
                        {!data
                            ? " "
                            : outOfStep
                                ? `Calculated ${currency.format(data.calculatedBalance)} · Update to sync`
                                : `${branchName ?? "All branches"}${lastUpdated ? ` · Updated ${DateToDateTimeString(lastUpdated)}` : ""}`}
                    </p>
                </div>
            </div>

            {data && (data.canUpdate || data.canReset) && (
                <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-end">
                    {data.canReset && (
                        <Button
                            onClick={() => setConfirm("reset")}
                            disabled={busy || !canReset}
                            loading={isResetting}
                            title={canReset ? undefined : "Select a branch to reset its balance"}
                            className={`${actionButton} bg-white! text-rose-600! ring-1 ring-rose-200 hover:bg-rose-50! disabled:hover:bg-white!`}
                        >
                            {!isResetting && <RotateCcw className="size-4" />} Reset Balance
                        </Button>
                    )}
                    {data.canUpdate && (
                        <Button onClick={() => setConfirm("update")} disabled={busy} loading={isUpdating} className={actionButton}>
                            {!isUpdating && <RefreshCw className="size-4" />} Update Balance
                        </Button>
                    )}
                </div>
            )}
            {data?.canReset && !branchId && (
                <p className="text-xs text-slate-500 lg:text-right">Select a branch to reset its balance.</p>
            )}

            <Dialog open={confirm === "update"} onClose={() => setConfirm(null)} title={`Update ${config.title} Balance`} preventClose={isUpdating} className="max-w-md">
                {data && (
                    <Formik
                        initialValues={balanceInitialValues(data, branchId)}
                        validationSchema={ledgerBalanceSchema}
                        onSubmit={(values) => updateBalance(values)}
                    >
                        <Form className="flex flex-col gap-4" noValidate>
                            <BalanceFields config={config} summary={data} lockBranch={!!branchId || !data.canSetAmount} canSetAmount={data.canSetAmount} />
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

            <ConfirmDialog
                open={confirm === "reset"}
                onClose={() => setConfirm(null)}
                onConfirm={() => branchId && resetBalance(branchId)}
                loading={isResetting}
                title={`Reset ${config.title} Balance`}
                confirmLabel="Confirm Reset"
                message={
                    <div className="flex flex-col gap-2">
                        <p>
                            The <span className="font-semibold text-gray-900">{config.title}</span> balance of{" "}
                            <span className="font-semibold text-gray-900">{branchName}</span> will be reset from{" "}
                            <span className="font-semibold text-gray-900">{data ? currency.format(data.balance) : "—"}</span> to{" "}
                            <span className="font-semibold text-gray-900">0</span>.
                        </p>
                        <p>
                            Only {config.noun} entries{config.kind === "income" ? " and sales" : ""} recorded after the reset will count toward it.
                            No {config.noun} entries{config.kind === "income" ? ", sales" : ""} or history are deleted, and other branches and
                            the {config.kind === "income" ? "expense" : "income"} balance are not changed.
                        </p>
                    </div>
                }
            />
        </section>
    );
};

// Starts on the branch in view (else the first one) with its calculated balance filled in
const balanceInitialValues = (summary: ILedgerBalanceModel, branchId: number | null): ILedgerBalanceFormValues => {
    const branch = summary.branch.find((b) => b.branchId === branchId) ?? summary.branch[0];
    return { branchId: branch ? String(branch.branchId) : "", balance: branch ? branch.calculatedBalance : "" };
};

interface BalanceFieldsProps {
    config: LedgerConfig;
    summary: ILedgerBalanceModel;
    lockBranch: boolean;
    /** Admins only; members get the calculated balance, read-only */
    canSetAmount: boolean;
}

// Branch and amount of the balance to save, as on Rajkot Expense. Picking another branch fills
// in that branch's calculated balance, which an admin can change before saving.
const BalanceFields = ({ config, summary, lockBranch, canSetAmount }: BalanceFieldsProps) => {
    const { values, setFieldValue } = useFormikContext<ILedgerBalanceFormValues>();
    const branch = summary.branch.find((b) => String(b.branchId) === values.branchId);
    const branchOptions: SelectOption[] = summary.branch.map((b) => ({ value: String(b.branchId), label: b.branchName }));
    const other = config.kind === "income" ? "expense" : "income";

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
                autoFocus={canSetAmount}
                disabled={!canSetAmount}
                component={Input}
            />
            {branch && (
                <div className="flex flex-col gap-1 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    <span>Current balance: <span className="font-semibold text-slate-900">{currency.format(branch.balance)}</span></span>
                    <span>
                        Calculated from {config.noun} entries{config.kind === "income" ? " and sales" : ""} since the last reset:{" "}
                        <span className="font-semibold text-slate-900">{currency.format(branch.calculatedBalance)}</span>
                    </span>
                    {config.kind === "income" && (
                        <span>Entries {currency.format(branch.entriesTotal ?? 0)} · Sales {currency.format(branch.salesTotal ?? 0)}</span>
                    )}
                    {branch.balanceUpdatedAt && <span>Last updated {DateToDateTimeString(branch.balanceUpdatedAt)}</span>}
                </div>
            )}
            <p className="text-xs text-slate-500">
                {canSetAmount
                    ? "The amount entered is saved as this branch's balance."
                    : "Your branch's balance is recalculated from its records and saved."}{" "}
                Other branches, the {other} balance and {config.noun} entries are not changed.
            </p>
        </>
    );
};

export default LedgerBalance;
