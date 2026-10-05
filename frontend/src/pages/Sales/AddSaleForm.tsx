import { Field, Form, Formik, useFormikContext } from "formik";
import { useEffect, useMemo, useRef } from "react";
import { useSelector } from "react-redux";
import { useMutation, useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import toast from "react-hot-toast";
import { Input } from "@/components/formik-fields/Input";
import { Select, type SelectOption } from "@/components/formik-fields/Select";
import { PhoneInput } from "@/components/formik-fields/PhoneInput";
import { DatePicker, DATE_VALUE_FORMAT } from "@/components/formik-fields/DatePicker";
import { Button } from "@/components/Button";
import { Dialog } from "@/components/Dialog";
import saleService from "@/services/sale-service";
import { saleSchema } from "@/validation/validation";
import type { RootState } from "@/store/store";
import type { IProductBranchScopeModel } from "@/models/Product";
import type { ISaleFormValues, ISaleModel } from "@/models/Sale";

interface AddSaleFormProps {
    open: boolean;
    onClose: () => void;
    onSaved: () => void;
    /** Branches the user may use, from the API */
    scope: IProductBranchScopeModel;
    /** When set the form edits this sale, otherwise it adds one. */
    sale?: ISaleModel | null;
}

// Products stocked in the form's branch. Branch members only ever get their own branch's
// stock from the API, whatever branchId is sent.
const useBranchProducts = (branchId: string) => {
    const userId = useSelector((state: RootState) => state.auth.userId);
    return useQuery({
        queryKey: ["sale-products", userId, branchId],
        queryFn: async () => {
            const response = await saleService.saleProducts(Number(branchId));
            if (!response?.data?.status) throw new Error("Could not load products for this branch.");
            return response.data.data.product;
        },
        enabled: !!branchId,
        // Stock changes with every sale, so always load it fresh when the form opens
        staleTime: 0,
        retry: false,
    });
};

// When an admin switches branch the chosen product may not be stocked there, so clear it.
// Switching back to the sale's own branch while editing restores the original product.
const BranchProductSync = ({ sale }: { sale?: ISaleModel | null }) => {
    const { values, setFieldValue } = useFormikContext<ISaleFormValues>();
    const previousBranch = useRef(values.branchId);

    useEffect(() => {
        if (values.branchId === previousBranch.current) return;
        previousBranch.current = values.branchId;
        const original = sale && String(sale.branchId) === values.branchId && sale.productId ? String(sale.productId) : "";
        setFieldValue("productId", original, false);
    }, [values.branchId, sale, setFieldValue]);

    return null;
};

// Product picker plus quantity, both checked against the selected branch's stock
const ProductAndQuantityFields = ({ sale }: { sale?: ISaleModel | null }) => {
    const { values } = useFormikContext<ISaleFormValues>();
    const { data: products = [], isFetching, isError } = useBranchProducts(values.branchId);

    // While editing, the quantity this sale already took from the same branch's stock counts as available
    const availableOf = (productId: number, stock: number) =>
        stock + (sale && sale.productId === productId && String(sale.branchId) === values.branchId ? sale.quantity : 0);

    const productOptions = useMemo<SelectOption[]>(() => products.map((p) => {
        const available = availableOf(p.id, p.quantity);
        return {
            value: String(p.id),
            label: available > 0 ? `${p.name} (${available.toLocaleString("en-IN")} in stock)` : `${p.name} (Out of stock)`,
            disabled: available <= 0,
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }), [products, sale, values.branchId]);

    const selected = products.find((p) => String(p.id) === values.productId);
    const available = selected ? availableOf(selected.id, selected.quantity) : undefined;
    const originalMissing = !!sale && String(sale.branchId) === values.branchId
        && !products.some((p) => p.id === sale.productId);

    const validateQuantity = (value: number | "") =>
        available !== undefined && value !== "" && Number(value) > available
            ? `Only ${available.toLocaleString("en-IN")} in stock`
            : undefined;

    const productPlaceholder = !values.branchId
        ? "Select a branch first"
        : isFetching ? "Loading products..." : products.length === 0 ? "No products in this branch" : "Select product";

    return (
        <>
            <div className="flex flex-col gap-1">
                <Field
                    id="productId"
                    name="productId"
                    label="Product"
                    options={productOptions}
                    placeholder={productPlaceholder}
                    disabled={!values.branchId || isFetching || products.length === 0}
                    component={Select}
                />
                {isError && <p className="px-1 text-xs text-red-500">Could not load products for this branch.</p>}
                {originalMissing && !values.productId && !isFetching && (
                    <p className="px-1 text-xs text-slate-500">
                        This sale was for <span className="font-semibold text-slate-700">{sale?.productName}</span>, which is no longer stocked in this branch. Select a product to save changes.
                    </p>
                )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1">
                    <Field
                        id="quantity"
                        name="quantity"
                        type="number"
                        inputMode="numeric"
                        min={1}
                        step={1}
                        label="Quantity"
                        placeholder="Enter quantity"
                        validate={validateQuantity}
                        component={Input}
                    />
                    {available !== undefined && (
                        <p className="px-1 text-xs text-slate-500">Available: {available.toLocaleString("en-IN")}</p>
                    )}
                </div>
                <Field
                    id="sellingAmount"
                    name="sellingAmount"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.01"
                    label="Selling Amount (₹)"
                    placeholder="Enter final amount"
                    component={Input}
                />
            </div>
        </>
    );
};

const AddSaleForm = ({ open, onClose, onSaved, scope, sale }: AddSaleFormProps) => {
    const isEdit = !!sale;
    const { isAdmin } = scope;
    const today = useMemo(() => new Date(), []);

    // New sales go to active branches only; a sale's current branch stays listed while editing
    const branchOptions = useMemo<SelectOption[]>(() => scope.branch
        .filter((b) => !isAdmin || b.isActive || b.id === sale?.branchId)
        .map((b) => ({ value: String(b.id), label: b.isActive ? b.name : `${b.name} (Inactive)` })),
    [scope.branch, isAdmin, sale]);

    const initialValues = useMemo<ISaleFormValues>(() => ({
        customerName: sale?.customerName ?? "",
        customerPhone: sale?.customerPhone ?? "",
        productId: sale?.productId ? String(sale.productId) : "",
        quantity: sale?.quantity ?? 1,
        sellingAmount: sale?.sellingAmount ?? "",
        saleDate: sale?.saleDate ?? format(today, DATE_VALUE_FORMAT),
        // Branch members are always on their own branch
        branchId: !isAdmin ? String(scope.branchId ?? "") : sale ? String(sale.branchId) : "",
    }), [sale, isAdmin, scope.branchId, today]);

    const { mutate: saveSale, isPending } = useMutation({
        mutationFn: (values: ISaleFormValues) => {
            const body = {
                customerName: values.customerName.trim(),
                customerPhone: values.customerPhone,
                productId: Number(values.productId),
                quantity: Number(values.quantity),
                sellingAmount: Number(values.sellingAmount),
                saleDate: values.saleDate,
                branchId: Number(values.branchId),
            };
            return sale ? saleService.updateSale(sale.id, body) : saleService.createSale(body);
        },
        onSuccess: (response) => {
            // http-service shows its own toast and resolves undefined for handled API errors
            if (response?.data?.status) {
                toast.success(response.data.message || (isEdit ? "Sale updated successfully" : "Sale added successfully"));
                onSaved();
                onClose();
            }
        },
        onError: (error) => {
            toast.error(typeof error === "string" ? error : "Something went wrong");
        },
    });

    return (
        <Dialog open={open} onClose={onClose} title={isEdit ? "Edit Sale" : "Add Sale"} preventClose={isPending}>
            <Formik
                initialValues={initialValues}
                validationSchema={saleSchema}
                onSubmit={(values) => saveSale(values)}
            >
                <Form className="flex flex-col gap-4" noValidate>
                    {isAdmin && <BranchProductSync sale={sale} />}
                    <div className="grid gap-4 sm:grid-cols-2">
                        <Field
                            id="customerName"
                            name="customerName"
                            label="Customer Name"
                            placeholder="Enter customer name"
                            component={Input}
                            autoFocus
                        />
                        <Field
                            id="customerPhone"
                            name="customerPhone"
                            label="Customer Phone Number"
                            placeholder="Enter phone number"
                            component={PhoneInput}
                        />
                    </div>
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
                        <Field
                            id="saleDate"
                            name="saleDate"
                            label="Sale Date"
                            maxDate={today}
                            component={DatePicker}
                        />
                    </div>
                    <ProductAndQuantityFields sale={sale} />

                    <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                        <Button
                            onClick={onClose}
                            disabled={isPending}
                            className="sm:w-auto bg-gray-100! text-gray-700! hover:bg-gray-200! focus-visible:ring-gray-400!"
                        >
                            Cancel
                        </Button>
                        <Button type="submit" loading={isPending} className="sm:w-auto">
                            {isEdit ? "Update Sale" : "Save Sale"}
                        </Button>
                    </div>
                </Form>
            </Formik>
        </Dialog>
    );
};

export default AddSaleForm;
