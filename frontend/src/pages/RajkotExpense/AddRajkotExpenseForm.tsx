import { Field, FieldArray, Form, Formik, getIn, useFormikContext } from "formik";
import { useEffect, useMemo, useRef } from "react";
import { useSelector } from "react-redux";
import { useMutation, useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Plus, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { Input } from "@/components/formik-fields/Input";
import { Select, type SelectOption } from "@/components/formik-fields/Select";
import { Textarea } from "@/components/formik-fields/Textarea";
import { DatePicker, DATE_VALUE_FORMAT } from "@/components/formik-fields/DatePicker";
import { Button } from "@/components/Button";
import { Dialog } from "@/components/Dialog";
import rajkotExpenseService from "@/services/rajkot-expense-service";
import productService from "@/services/product-service";
import { useDebounce } from "@/hook/useDebounce";
import { rajkotExpenseSchema, splitSerialNumbers } from "@/validation/validation";
import type { RootState } from "@/store/store";
import type {
    IRajkotExpenseCreateModel, IRajkotExpenseFormValues, IRajkotExpenseItemFormValues,
    IRajkotExpenseOptionsModel, IRajkotExpenseProductModel,
} from "@/models/RajkotExpense";
import { currency } from "@/pages/Ledger/ledgerConfig";

interface AddRajkotExpenseFormProps {
    open: boolean;
    onClose: () => void;
    onSaved: () => void;
    options: IRajkotExpenseOptionsModel;
    /** Branch picked in the page filter; a new entry starts there */
    filterBranchId: number | null;
}

let rowKey = 0;
const emptyItem = (): IRajkotExpenseItemFormValues => ({
    key: `row-${++rowKey}`,
    productId: "",
    hasSerialNumber: false,
    quantity: "",
    serialText: "",
    amount: "",
});

// Catalogue products with their stock in the form's branch
const useBranchProducts = (branchId: string) => {
    const userId = useSelector((state: RootState) => state.auth.userId);
    return useQuery({
        queryKey: ["rajkot-expense-products", userId, branchId],
        queryFn: async () => {
            const response = await rajkotExpenseService.products(Number(branchId));
            if (!response?.data?.status) throw new Error("Could not load products for this branch.");
            return response.data.data.product;
        },
        enabled: !!branchId,
        // Stock changes with every sale, so always load it fresh when the form opens
        staleTime: 0,
        retry: false,
    });
};

// Products belong to one branch's stock, so switching branch starts the rows over
const BranchItemsSync = () => {
    const { values, setFieldValue } = useFormikContext<IRajkotExpenseFormValues>();
    const previousBranch = useRef(values.branchId);

    useEffect(() => {
        if (values.branchId === previousBranch.current) return;
        previousBranch.current = values.branchId;
        setFieldValue("items", [emptyItem()], false);
    }, [values.branchId, setFieldValue]);

    return null;
};

const listForMessage = (serials: string[]) =>
    serials.length > 5 ? `${serials.slice(0, 5).join(", ")} and ${serials.length - 5} more` : serials.join(", ");

// New serial numbers of a serialized product, one per line; the row's quantity is how many there
// are. Repeats (in this row or another one) and serial numbers that already exist (in stock or
// sold) are flagged while typing; saving checks again, including other Rajkot Expense entries.
const SerialNumbersField = ({ name, index }: { name: string; index: number }) => {
    const { values, setFieldValue } = useFormikContext<IRajkotExpenseFormValues>();
    const text: string = getIn(values, `${name}.serialText`) ?? "";
    const serials = useMemo(() => splitSerialNumbers(text), [text]);
    const debounced = useDebounce(serials, 500);

    // Keep the quantity in step with the number of serial numbers
    useEffect(() => {
        setFieldValue(`${name}.quantity`, serials.length, false);
    }, [serials.length, name, setFieldValue]);

    const toCheck = useMemo(() => [...new Set(debounced.filter((sn) => sn.length <= 100))].sort(), [debounced]);
    const { data: existing = [], isFetching: isChecking } = useQuery({
        queryKey: ["serial-check", toCheck],
        queryFn: async () => (await productService.checkSerials(toCheck))?.data?.data?.existing ?? [],
        enabled: toCheck.length > 0,
        staleTime: 0,
    });

    const otherRows = useMemo(() => new Set(values.items
        .filter((item, i) => i !== index && item.hasSerialNumber)
        .flatMap((item) => splitSerialNumbers(item.serialText).map((sn) => sn.toLowerCase()))), [values.items, index]);
    const seen = new Set<string>();
    const repeated = [...new Set(serials.filter((sn) => {
        const key = sn.toLowerCase();
        const isRepeat = seen.has(key) || otherRows.has(key);
        seen.add(key);
        return isRepeat;
    }))];
    const existingNow = existing.filter((sn) => serials.some((typed) => typed.toLowerCase() === sn.toLowerCase()));

    return (
        <div className="flex flex-col gap-1">
            <Field
                id={`${name}.serialText`}
                name={`${name}.serialText`}
                label="New Serial Numbers (one per line)"
                placeholder={"SN-1001\nSN-1002"}
                rows={3}
                component={Textarea}
            />
            <p className="px-1 text-xs text-slate-500">
                {serials.length.toLocaleString("en-IN")} {serials.length === 1 ? "serial number" : "serial numbers"}
                {isChecking && <span className="ml-2 text-slate-400">Checking...</span>}
            </p>
            {repeated.length > 0 && <p className="px-1 text-xs text-red-500">Entered more than once: {listForMessage(repeated)}</p>}
            {existingNow.length > 0 && <p className="px-1 text-xs text-red-500">Already exists: {listForMessage(existingNow)}</p>}
        </div>
    );
};

interface ItemRowProps {
    index: number;
    products: IRajkotExpenseProductModel[];
    /** Products already picked in other rows */
    takenIds: Set<string>;
    canRemove: boolean;
    onRemove: () => void;
}

const ItemRow = ({ index, products, takenIds, canRemove, onRemove }: ItemRowProps) => {
    const { values, setFieldValue } = useFormikContext<IRajkotExpenseFormValues>();
    const name = `items.${index}`;
    const item = values.items[index];
    const product = products.find((p) => String(p.id) === item.productId);

    // Accepting adds the products to stock, so any catalogue product can be picked
    const productOptions = useMemo<SelectOption[]>(() => products.map((p) => {
        const taken = takenIds.has(String(p.id));
        const detail = `${p.hasSerialNumber ? "Serialized" : "Non-serialized"} · ${p.quantity.toLocaleString("en-IN")} in stock`;
        return {
            value: String(p.id),
            label: `${p.name} (${detail})${taken ? " · already added" : ""}`,
            disabled: taken,
        };
    }), [products, takenIds]);

    // A new product starts the row's quantity and serial numbers over
    const previousProduct = useRef(item.productId);
    useEffect(() => {
        if (item.productId === previousProduct.current) return;
        previousProduct.current = item.productId;
        const picked = products.find((p) => String(p.id) === item.productId);
        setFieldValue(`${name}.hasSerialNumber`, !!picked?.hasSerialNumber, false);
        setFieldValue(`${name}.serialText`, "", false);
        setFieldValue(`${name}.quantity`, picked?.hasSerialNumber ? 0 : "", false);
    }, [item.productId, products, name, setFieldValue]);

    return (
        <li className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 sm:p-4">
            <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Product {index + 1}</span>
                <button
                    type="button"
                    onClick={onRemove}
                    disabled={!canRemove}
                    title={canRemove ? "Remove product" : "An entry needs at least one product"}
                    aria-label={`Remove product ${index + 1}`}
                    className="inline-flex size-8 items-center justify-center rounded-lg text-red-500 transition-colors hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent"
                >
                    <Trash2 className="size-4" />
                </button>
            </div>
            <Field
                id={`${name}.productId`}
                name={`${name}.productId`}
                label="Product"
                options={productOptions}
                placeholder="Select product"
                component={Select}
            />
            {product?.hasSerialNumber && <SerialNumbersField name={name} index={index} />}
            <div className="grid gap-3 sm:grid-cols-2">
                {product?.hasSerialNumber ? (
                    <div className="flex h-14 flex-col justify-center rounded-xl bg-white px-3">
                        <span className="text-xs font-medium text-gray-600">Quantity</span>
                        <span className="text-sm text-gray-900">{splitSerialNumbers(item.serialText).length.toLocaleString("en-IN")} (from serial numbers)</span>
                    </div>
                ) : (
                    <div className="flex flex-col gap-1">
                        <Field
                            id={`${name}.quantity`}
                            name={`${name}.quantity`}
                            type="number"
                            inputMode="numeric"
                            min={1}
                            step={1}
                            label="Quantity"
                            placeholder="Enter quantity"
                            disabled={!product}
                            component={Input}
                        />
                        {product && <p className="px-1 text-xs text-slate-500">Current stock: {product.quantity.toLocaleString("en-IN")}</p>}
                    </div>
                )}
                <Field
                    id={`${name}.amount`}
                    name={`${name}.amount`}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.01"
                    label="Expense Amount (₹)"
                    placeholder="Enter amount"
                    component={Input}
                />
            </div>
        </li>
    );
};

const ItemRows = () => {
    const { values, errors, touched } = useFormikContext<IRajkotExpenseFormValues>();
    const { data: products = [], isFetching, isError } = useBranchProducts(values.branchId);
    const listError = typeof errors.items === "string" && touched.items ? errors.items : undefined;

    const totalUnits = values.items.reduce((sum, item) => sum + (item.hasSerialNumber ? splitSerialNumbers(item.serialText).length : Number(item.quantity) || 0), 0);
    const totalAmount = values.items.reduce((sum, item) => sum + Math.round((Number(item.amount) || 0) * 100), 0) / 100;

    if (!values.branchId) return <p className="rounded-xl bg-slate-50 px-3 py-4 text-center text-sm text-slate-500">Select a branch to add its products.</p>;
    if (isFetching) return <div className="h-40 animate-pulse rounded-2xl bg-slate-100" />;
    if (isError) return <p className="px-1 text-xs text-red-500">Could not load products for this branch.</p>;
    if (products.length === 0) return <p className="rounded-xl bg-slate-50 px-3 py-4 text-center text-sm text-slate-500">No products found. Add products first.</p>;

    return (
        <FieldArray name="items">
            {({ push, remove }) => (
                <div className="flex flex-col gap-3">
                    <ul className="flex flex-col gap-3">
                        {values.items.map((item, index) => (
                            <ItemRow
                                key={item.key}
                                index={index}
                                products={products}
                                takenIds={new Set(values.items.filter((_, i) => i !== index).map((x) => x.productId).filter(Boolean))}
                                canRemove={values.items.length > 1}
                                onRemove={() => remove(index)}
                            />
                        ))}
                    </ul>
                    {listError && <p className="px-1 text-xs text-red-500">{listError}</p>}
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <Button
                            onClick={() => push(emptyItem())}
                            disabled={values.items.length >= 100}
                            className="sm:w-auto bg-blue-50! text-blue-600! hover:bg-blue-100! disabled:hover:bg-blue-50!"
                        >
                            <Plus className="size-4" /> Add Product
                        </Button>
                        <p className="text-sm text-slate-600">
                            {totalUnits.toLocaleString("en-IN")} {totalUnits === 1 ? "unit" : "units"} ·{" "}
                            <span className="font-semibold text-slate-900">{currency.format(totalAmount)}</span>
                        </p>
                    </div>
                </div>
            )}
        </FieldArray>
    );
};

// Admins add an entry for a branch with one or more products. The branch's employees then see
// it as Pending and accept it, which adds the products to the branch's stock.
const AddRajkotExpenseForm = ({ open, onClose, onSaved, options, filterBranchId }: AddRajkotExpenseFormProps) => {
    const today = useMemo(() => new Date(), []);

    const branchOptions = useMemo<SelectOption[]>(() => options.branch
        .filter((b) => b.isActive)
        .map((b) => ({ value: String(b.id), label: b.name })),
    [options.branch]);

    const initialValues = useMemo<IRajkotExpenseFormValues>(() => {
        const isActive = (id: number | null) => !!id && options.branch.some((b) => b.id === id && b.isActive);
        return {
            branchId: isActive(filterBranchId) ? String(filterBranchId) : "",
            entryDate: format(today, DATE_VALUE_FORMAT),
            description: "",
            items: [emptyItem()],
        };
    // Recalculated each time the dialog opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, filterBranchId, options.branch, today]);

    const { mutate: saveEntry, isPending } = useMutation({
        mutationFn: (values: IRajkotExpenseFormValues) => {
            const body: IRajkotExpenseCreateModel = {
                branchId: Number(values.branchId),
                entryDate: values.entryDate,
                description: values.description.trim(),
                items: values.items.map((item) => ({
                    productId: Number(item.productId),
                    ...(item.hasSerialNumber
                        ? (() => {
                            const serialNumbers = splitSerialNumbers(item.serialText);
                            return { serialNumbers, quantity: serialNumbers.length };
                        })()
                        : { quantity: Number(item.quantity) }),
                    amount: Number(item.amount),
                })),
            };
            return rajkotExpenseService.create(body);
        },
        onSuccess: (response) => {
            // http-service shows its own toast and resolves undefined for handled API errors
            if (response?.data?.status) {
                toast.success(response.data.message || "Rajkot expense added successfully");
                onSaved();
                onClose();
            }
        },
        onError: (error) => {
            toast.error(typeof error === "string" ? error : "Something went wrong");
        },
    });

    return (
        <Dialog open={open} onClose={onClose} title="Add Rajkot Expense" preventClose={isPending}
            className="max-w-2xl max-h-[calc(100dvh-2rem)] overflow-y-auto!">
            <Formik
                key={String(open)}
                initialValues={initialValues}
                validationSchema={rajkotExpenseSchema}
                onSubmit={(values) => saveEntry(values)}
            >
                <Form className="flex flex-col gap-4" noValidate>
                    <BranchItemsSync />
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="flex flex-col gap-1">
                            <Field id="branchId" name="branchId" label="Branch" options={branchOptions} placeholder="Select branch" component={Select} />
                            {branchOptions.length === 0 && <p className="px-1 text-xs text-red-500">No active branches found. Add a branch first.</p>}
                        </div>
                        <Field id="entryDate" name="entryDate" label="Date" maxDate={today} component={DatePicker} />
                    </div>
                    <ItemRows />
                    <Field
                        id="description"
                        name="description"
                        label="Description / Notes"
                        placeholder="Optional details"
                        rows={2}
                        component={Textarea}
                    />
                    <p className="-mt-2 text-xs text-slate-500">
                        The entry stays Pending until an employee of the selected branch accepts it. Accepting adds these
                        products and serial numbers to that branch's stock.
                    </p>

                    <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                        <Button
                            onClick={onClose}
                            disabled={isPending}
                            className="sm:w-auto bg-gray-100! text-gray-700! hover:bg-gray-200! focus-visible:ring-gray-400!"
                        >
                            Cancel
                        </Button>
                        <Button type="submit" loading={isPending} className="sm:w-auto">
                            Save Rajkot Expense
                        </Button>
                    </div>
                </Form>
            </Formik>
        </Dialog>
    );
};

export default AddRajkotExpenseForm;
