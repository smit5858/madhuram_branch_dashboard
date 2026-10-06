import { Field, Form, Formik, useFormikContext } from "formik";
import { useEffect, useMemo, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Input } from "@/components/formik-fields/Input";
import { Textarea } from "@/components/formik-fields/Textarea";
import { Switch } from "@/components/formik-fields/Switch";
import { Select, type SelectOption } from "@/components/formik-fields/Select";
import { Button } from "@/components/Button";
import { Dialog } from "@/components/Dialog";
import productService from "@/services/product-service";
import { useDebounce } from "@/hook/useDebounce";
import { productSchema, splitSerialNumbers } from "@/validation/validation";
import type { IProductBranchScopeModel, IProductCreateModel, IProductFormValues, IProductModel } from "@/models/Product";

interface AddProductFormProps {
    open: boolean;
    onClose: () => void;
    onSaved: () => void;
    /** Branches the user may use, from the API */
    scope: IProductBranchScopeModel;
    /** When set the form edits this product's stock, otherwise it adds stock. */
    product?: IProductModel | null;
}

const stockIn = (product: IProductModel | null | undefined, branchId: string) =>
    product?.stocks.find((s) => String(s.branchId) === branchId);

const quantityIn = (product: IProductModel | null | undefined, branchId: string) => stockIn(product, branchId)?.quantity;

const serialTextIn = (product: IProductModel | null | undefined, branchId: string) =>
    (stockIn(product, branchId)?.serialNumbers ?? []).join("\n");

// When an admin switches branch while editing, load that branch's current quantity / serial numbers
const BranchQuantitySync = ({ product }: { product: IProductModel }) => {
    const { values, setFieldValue } = useFormikContext<IProductFormValues>();
    const previousBranch = useRef(values.branchId);

    useEffect(() => {
        if (values.branchId === previousBranch.current) return;
        previousBranch.current = values.branchId;
        setFieldValue("quantity", quantityIn(product, values.branchId) ?? 0, false);
        setFieldValue("serialNumbers", serialTextIn(product, values.branchId), false);
    }, [values.branchId, product, setFieldValue]);

    return null;
};

const BranchStockHint = ({ product, branches }: { product?: IProductModel | null; branches: SelectOption[] }) => {
    const { values } = useFormikContext<IProductFormValues>();
    if (!values.branchId) return null;

    const branchName = branches.find((b) => b.value === values.branchId)?.label ?? "this branch";
    const current = quantityIn(product, values.branchId);

    if (!product) {
        return (
            <p className="-mt-2 px-1 text-xs text-slate-500">
                {values.hasSerialNumber
                    ? `If this product already exists in ${branchName}, these units are added to its current stock.`
                    : `If this product already exists in ${branchName}, the quantity is added to its current stock.`}
            </p>
        );
    }
    if (product.hasSerialNumber) {
        return (
            <p className="-mt-2 px-1 text-xs text-slate-500">
                {current === undefined
                    ? `${branchName} has no stock of this product yet. Saving adds these units.`
                    : `These are the units in stock in ${branchName}. Add a line to add a unit, delete a line to remove it. Sold units aren't listed.`}
            </p>
        );
    }
    return (
        <p className="-mt-2 px-1 text-xs text-slate-500">
            {current === undefined
                ? `${branchName} has no stock of this product yet. Saving will add it.`
                : `Current stock in ${branchName}: ${current}. Saving replaces it with the quantity above.`}
        </p>
    );
};

// Every value typed more than once (case-insensitive, like the database)
const repeatedSerials = (serials: string[]) => {
    const seen = new Set<string>();
    const repeated = new Map<string, string>();
    for (const sn of serials) {
        const key = sn.toLowerCase();
        if (seen.has(key)) repeated.set(key, sn);
        seen.add(key);
    }
    return [...repeated.values()];
};

const listForMessage = (serials: string[]) =>
    serials.length > 5 ? `${serials.slice(0, 5).join(", ")} and ${serials.length - 5} more` : serials.join(", ");

// Serial number box for tracked products; the quantity is the number of serial numbers.
// Repeats and serial numbers that already exist (in stock anywhere or sold) are flagged while
// typing and block saving; the API checks again on save.
const SerialNumbersField = ({ isEdit, product }: { isEdit: boolean; product?: IProductModel | null }) => {
    const { values, touched, validateField } = useFormikContext<IProductFormValues>();
    // Once the box has been left, Formik shows the same message under it, so the live ones step aside
    const showLive = !touched.serialNumbers;
    const serials = useMemo(() => splitSerialNumbers(values.serialNumbers), [values.serialNumbers]);
    const count = serials.length;

    // Units already in this branch's stock are this product's own, not duplicates
    const ownSerials = useMemo(
        () => new Set((stockIn(product, values.branchId)?.serialNumbers ?? []).map((sn) => sn.toLowerCase())),
        [product, values.branchId],
    );
    const toCheck = useDebounce(useMemo(
        () => [...new Set(serials.filter((sn) => sn.length <= 100 && !ownSerials.has(sn.toLowerCase())))].sort(),
        [serials, ownSerials],
    ));

    const { data: existing = [], isFetching: isChecking } = useQuery({
        queryKey: ["serial-check", toCheck],
        queryFn: async () => {
            const response = await productService.checkSerials(toCheck);
            return response?.data?.status ? response.data.data.existing : [];
        },
        enabled: toCheck.length > 0,
        retry: false,
    });

    // The server answer arrives after typing, so re-run the field check once it does
    useEffect(() => {
        if (touched.serialNumbers) validateField("serialNumbers");
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [existing]);

    const repeated = repeatedSerials(serials);
    const existingNow = existing.filter((sn) => serials.some((typed) => typed.toLowerCase() === sn.toLowerCase()));

    // On add at least one unit is needed; on edit an empty list sets the branch's stock to 0
    const validate = (value: string) => {
        const list = splitSerialNumbers(value);
        if (!isEdit && list.length === 0) return "Enter at least one serial number";
        const repeats = repeatedSerials(list);
        if (repeats.length > 0) return `Entered more than once: ${listForMessage(repeats)}`;
        const taken = existing.filter((sn) => list.some((typed) => typed.toLowerCase() === sn.toLowerCase()));
        if (taken.length > 0) return `Already exists: ${listForMessage(taken)}`;
        return undefined;
    };

    return (
        <div className="flex flex-col gap-1">
            <Field
                id="serialNumbers"
                name="serialNumbers"
                label="Serial Numbers (one per line)"
                placeholder={"SN1001\nSN1002\nSN1003"}
                rows={5}
                validate={validate}
                component={Textarea}
            />
            {/* Shown as soon as they're typed, not only after leaving the box */}
            {showLive && repeated.length > 0 && (
                <p className="px-1 text-xs text-red-500">Entered more than once: {listForMessage(repeated)}</p>
            )}
            {showLive && existingNow.length > 0 && (
                <p className="px-1 text-xs text-red-500">Already exists: {listForMessage(existingNow)}</p>
            )}
            <p className="px-1 text-xs text-slate-500">
                Quantity: <span className="font-semibold text-slate-700">{count.toLocaleString("en-IN")}</span>
                {count === 1 ? " unit" : " units"}
                {isChecking && <span className="ml-2 text-slate-400">Checking serial numbers...</span>}
            </p>
        </div>
    );
};

const AddProductForm = ({ open, onClose, onSaved, scope, product }: AddProductFormProps) => {
    const isEdit = !!product;
    const { isAdmin } = scope;

    // Only active branches can receive new stock; a branch that already holds this product stays listed
    const branchOptions = useMemo<SelectOption[]>(() => scope.branch
        .filter((b) => !isAdmin || b.isActive || quantityIn(product, String(b.id)) !== undefined)
        .map((b) => ({ value: String(b.id), label: b.isActive ? b.name : `${b.name} (Inactive)` })),
    [scope.branch, isAdmin, product]);

    const initialValues = useMemo<IProductFormValues>(() => {
        // Branch members are always on their own branch; admins editing start on the first stocked branch
        const branchId = !isAdmin
            ? String(scope.branchId ?? "")
            : product?.stocks[0] ? String(product.stocks[0].branchId) : "";
        return {
            name: product?.name ?? "",
            hasSerialNumber: product?.hasSerialNumber ?? false,
            serialNumbers: serialTextIn(product, branchId),
            quantity: quantityIn(product, branchId) ?? "",
            branchId,
        };
    }, [isAdmin, scope.branchId, product]);

    const { mutate: saveProduct, isPending } = useMutation({
        mutationFn: (values: IProductFormValues) => {
            const body: IProductCreateModel = {
                name: values.name.trim(),
                branchId: Number(values.branchId),
                ...(values.hasSerialNumber
                    ? { serialNumbers: splitSerialNumbers(values.serialNumbers) }
                    : { quantity: Number(values.quantity) }),
                // Whether a product uses serial numbers is only chosen when it is first added
                ...(!product && { hasSerialNumber: values.hasSerialNumber }),
            };
            return product ? productService.updateProduct(product.id, body) : productService.createProduct(body);
        },
        onSuccess: (response) => {
            // http-service shows its own toast and resolves undefined for handled API errors
            if (response?.data?.status) {
                toast.success(response.data.message || (isEdit ? "Product updated successfully" : "Product added successfully"));
                onSaved();
                onClose();
            }
        },
        onError: (error) => {
            toast.error(typeof error === "string" ? error : "Something went wrong");
        },
    });

    return (
        <Dialog open={open} onClose={onClose} title={isEdit ? "Edit Product Stock" : "Add Product"} preventClose={isPending}>
            <Formik
                initialValues={initialValues}
                validationSchema={productSchema}
                onSubmit={(values) => saveProduct(values)}
            >
                {({ values }) => (
                    <Form className="flex flex-col gap-4" noValidate>
                        {product && isAdmin && <BranchQuantitySync product={product} />}
                        <div className="flex flex-col gap-1">
                            <Field
                                id="name"
                                name="name"
                                label="Product Name"
                                placeholder="Enter product name"
                                // The name is shared by every branch, so only admins may rename
                                disabled={isEdit && !isAdmin}
                                component={Input}
                                autoFocus={!isEdit}
                            />
                            {isEdit && !isAdmin && (
                                <p className="px-1 text-xs text-slate-500">Only an admin can rename a product.</p>
                            )}
                        </div>
                        {!isEdit && (
                            <div className="flex flex-col gap-1">
                                <Field
                                    id="hasSerialNumber"
                                    name="hasSerialNumber"
                                    label="Each unit has a serial number"
                                    onLabel="Yes"
                                    offLabel="No"
                                    component={Switch}
                                />
                                <p className="px-1 text-xs text-slate-500">
                                    Can't be changed later. If the product already exists, its existing setting is used.
                                </p>
                            </div>
                        )}
                        <div className="grid gap-4 sm:grid-cols-2">
                            <Field
                                id="branchId"
                                name="branchId"
                                label="Branch"
                                options={branchOptions}
                                placeholder="Select branch"
                                disabled={!isAdmin}
                                component={Select}
                            />
                            {!values.hasSerialNumber && (
                                <Field
                                    id="quantity"
                                    name="quantity"
                                    type="number"
                                    inputMode="numeric"
                                    min={0}
                                    step={1}
                                    label={isEdit ? "Stock Quantity" : "Quantity to Add"}
                                    placeholder="Enter quantity"
                                    component={Input}
                                    autoFocus={isEdit}
                                />
                            )}
                        </div>
                        {values.hasSerialNumber && <SerialNumbersField isEdit={isEdit} product={product} />}
                        <BranchStockHint product={product} branches={branchOptions} />
                        {isAdmin && branchOptions.length === 0 && (
                            <p className="-mt-2 text-xs text-red-500">No active branches found. Add a branch first.</p>
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
                                {isEdit ? "Update Stock" : "Save Product"}
                            </Button>
                        </div>
                    </Form>
                )}
            </Formik>
        </Dialog>
    );
};

export default AddProductForm;
