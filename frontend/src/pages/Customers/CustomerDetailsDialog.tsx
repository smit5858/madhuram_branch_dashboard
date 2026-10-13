import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { CircleAlert } from "lucide-react";
import { Dialog } from "@/components/Dialog";
import { Button } from "@/components/Button";
import customerService from "@/services/customer-service";
import { formatPhone } from "@/util/CommonFunction";
import { DateToDateStringWithMonth } from "@/util/DateFormate";
import type { ICustomerModel } from "@/models/Customer";

interface CustomerDetailsDialogProps {
    /** The customer to show; the dialog is open while set */
    customer: ICustomerModel | null;
    onClose: () => void;
    onEdit: (customer: ICustomerModel) => void;
    /** Admins see sales from every branch, others only their own branch */
    isAdmin: boolean;
}

const currency = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });

const Detail = ({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) => (
    <div className={wide ? "sm:col-span-2" : undefined}>
        <dt className="text-xs font-medium text-gray-500">{label}</dt>
        <dd className="mt-0.5 break-words text-sm text-gray-900">{children || <span className="text-slate-400">—</span>}</dd>
    </div>
);

const CustomerDetailsDialog = ({ customer, onClose, onEdit, isAdmin }: CustomerDetailsDialogProps) => {
    // Always fetched fresh so the sales and any edits from elsewhere are current
    const { data, isFetching, isError, refetch } = useQuery({
        queryKey: ["customer", customer?.id],
        queryFn: async () => {
            const response = await customerService.customerById(customer!.id);
            if (!response?.data?.status) throw new Error("Could not load customer.");
            return response.data.data;
        },
        enabled: !!customer,
        staleTime: 0,
        retry: false,
    });

    // The row's details show right away; sales fill in once loaded
    const shown = data ?? customer;

    return (
        <Dialog open={!!customer} onClose={onClose} title="Customer Details" className="max-h-[calc(100dvh-2rem)] max-w-2xl overflow-y-auto!">
            {shown && (
                <div className="flex flex-col gap-5">
                    <dl className="grid gap-4 sm:grid-cols-2">
                        <Detail label="Customer Name">{shown.name}</Detail>
                        <Detail label="Phone Number">{formatPhone(shown.phone)}</Detail>
                        <Detail label="Email Address">{shown.email}</Detail>
                        <Detail label="Company / Shop / Garage Name">{shown.companyName}</Detail>
                        <Detail label="Address" wide>{shown.address}</Detail>
                        <Detail label="City">{shown.city}</Detail>
                        <Detail label="Pincode">{shown.pincode}</Detail>
                    </dl>

                    <section className="flex flex-col gap-3 border-t border-slate-100 pt-4">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <h3 className="text-sm font-semibold text-gray-900">Sales</h3>
                            {!isAdmin && <span className="text-xs text-slate-500">Your branch only</span>}
                        </div>
                        {isError ? (
                            <div className="flex items-center gap-2 text-xs text-red-500">
                                <CircleAlert className="size-4" />
                                Couldn't load this customer's sales.
                                <button type="button" onClick={() => refetch()} className="font-medium underline">Try again</button>
                            </div>
                        ) : !data ? (
                            <div className="h-20 animate-pulse rounded-xl bg-slate-100" aria-busy={isFetching} />
                        ) : data.sales.count === 0 ? (
                            <p className="text-sm text-slate-500">No sales recorded for this customer yet.</p>
                        ) : (
                            <>
                                <div className="grid grid-cols-3 gap-2 rounded-xl bg-gray-50 p-3 text-center">
                                    <div><p className="text-xs text-gray-500">Sales</p><p className="text-sm font-semibold tabular-nums">{data.sales.count.toLocaleString("en-IN")}</p></div>
                                    <div><p className="text-xs text-gray-500">Total</p><p className="text-sm font-semibold tabular-nums">{currency.format(data.sales.total)}</p></div>
                                    <div><p className="text-xs text-gray-500">Last Sale</p><p className="text-sm font-semibold tabular-nums">{data.sales.lastSaleDate ? DateToDateStringWithMonth(data.sales.lastSaleDate) : "—"}</p></div>
                                </div>
                                <ul className="flex flex-col divide-y divide-slate-100">
                                    {data.sales.recent.map((sale) => (
                                        <li key={sale.id} className="flex items-start justify-between gap-3 py-2 text-sm">
                                            <div className="min-w-0">
                                                <p className="truncate text-gray-900">
                                                    {sale.productName}
                                                    {sale.quantity > 1 && <span className="ml-1.5 text-xs text-slate-500">× {sale.quantity.toLocaleString("en-IN")}</span>}
                                                </p>
                                                <p className="text-xs text-slate-500">
                                                    {DateToDateStringWithMonth(sale.saleDate)}
                                                    {isAdmin && sale.branchName && <> · {sale.branchName}</>}
                                                </p>
                                            </div>
                                            <span className="shrink-0 font-medium tabular-nums text-slate-800">{currency.format(sale.sellingAmount)}</span>
                                        </li>
                                    ))}
                                </ul>
                                {data.sales.count > data.sales.recent.length && (
                                    <p className="text-xs text-slate-500">Showing the latest {data.sales.recent.length} of {data.sales.count.toLocaleString("en-IN")} sales.</p>
                                )}
                            </>
                        )}
                    </section>

                    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                        <Button
                            onClick={onClose}
                            className="sm:w-auto bg-gray-100! text-gray-700! hover:bg-gray-200! focus-visible:ring-gray-400!"
                        >
                            Close
                        </Button>
                        <Button onClick={() => onEdit(data ?? shown)} className="sm:w-auto">
                            Edit Customer
                        </Button>
                    </div>
                </div>
            )}
        </Dialog>
    );
};

export default CustomerDetailsDialog;
