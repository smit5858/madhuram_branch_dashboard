import { Field, Form, Formik, useFormikContext } from "formik";
import { useEffect, useMemo, useRef } from "react";
import { format } from "date-fns";
import { useMutation, useQuery } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Input } from "@/components/formik-fields/Input";
import { Textarea } from "@/components/formik-fields/Textarea";
import { Switch } from "@/components/formik-fields/Switch";
import { Select, type SelectOption } from "@/components/formik-fields/Select";
import { DatePicker, DATE_VALUE_FORMAT } from "@/components/formik-fields/DatePicker";
import { Button } from "@/components/Button";
import { Dialog } from "@/components/Dialog";
import productService from "@/services/product-service";
import { useDebounce } from "@/hook/useDebounce";
import { productSchema, purchaseDetailsSchema, splitSerialNumbers } from "@/validation/validation";
import type { IProductBranchScopeModel, IProductCreateModel, IProductFormValues, IProductModel, ProductType } from "@/models/Product";
import { PRODUCT_TYPE_LABEL } from "@/components/SerialHistory/serialDisplay";

// Serialized products take one serial number per physical unit, software one key per license
const usesSerials = (type: ProductType) => type === "Serialized" || type === "Software";

// Software has its own page (Software Licenses), so the Products form offers the other types
const TYPE_OPTIONS: SelectOption[] = (["Standard", "Serialized", "Service"] as ProductType[])
    .map((t) => ({ value: t, label: PRODUCT_TYPE_LABEL[t] }));

const TYPE_HINT: Record<ProductType, string> = {
    Standard: "Stock is a plain quantity.",
    Serialized: "Physical stock; each unit has its own serial number.",
    Software: "Each license key is tracked on its own. No physical stock: licenses sell even when the quantity is 0.",
    Service: "Nothing to stock. Each unit sold gets an installation ID for its history.",
};

interface AddProductFormProps {
    open: boolean;
    onClose: () => void;
    onSaved: () => void;
    /** Branches the user may use, from the API */
    scope: IProductBranchScopeModel;
    /** When set the form edits this product's stock, otherwise it adds stock. */
    product?: IProductModel | null;
    /** Software Licenses page: adds / edits software and its license keys only */
    softwareOnly?: boolean;
}

// Purchase details only apply to serial-tracked units being added
const addProductSchema = productSchema.shape(purchaseDetailsSchema);

// Supplier, date, cost and invoice of the units being added; each unit's history links back to it
const PurchaseFields = ({ isLicense }: { isLicense: boolean }) => {
    const today = useMemo(() => new Date(), []);
    return (
        <div className="flex flex-col gap-3 rounded-xl border border-slate-200 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{isLicense ? "License purchase (optional)" : "Purchase details (optional)"}</p>
            <div className="grid gap-3 sm:grid-cols-2">
                <Field id="supplierName" name="supplierName" label={isLicense ? "Software Provider" : "Supplier / Dealer"} placeholder="Supplier name" component={Input} />
                <Field id="purchaseReference" name="purchaseReference" label="Invoice / Reference No." placeholder="e.g. INV-1024" component={Input} />
                <Field id="purchaseDate" name="purchaseDate" label="Purchase Date" maxDate={today} component={DatePicker} />
                <Field id="unitAmount" name="unitAmount" type="number" inputMode="decimal" min={0} step="0.01" label={isLicense ? "Cost per License (₹)" : "Purchase Price per Unit (₹)"} placeholder="0" component={Input} />
            </div>
            <p className="px-1 text-xs text-slate-500">Recorded in each serial number's history and used for its profit.</p>
        </div>
    );
};

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
        const text: Record<ProductType, string> = {
            Standard: `If this product already exists in ${branchName}, the quantity is added to its current stock.`,
            Serialized: `If this product already exists in ${branchName}, these units are added to its current stock.`,
            Software: `These licenses join ${branchName}'s license pool. Physical stock isn't changed.`,
            Service: `${branchName} will offer this service.`,
        };
        return <p className="-mt-2 px-1 text-xs text-slate-500">{text[values.productType]}</p>;
    }
    if (product.productType === "Software") {
        return (
            <p className="-mt-2 px-1 text-xs text-slate-500">
                These are the licenses available in {branchName}'s pool. Add a line to add a license, delete a line to remove it. Sold licenses aren't listed. Physical stock isn't changed.
            </p>
        );
    }
    if (product.productType === "Service") {
        return <p className="-mt-2 px-1 text-xs text-slate-500">Services have no stock. Each sale creates installation IDs for its history.</p>;
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
const SerialNumbersField = ({ isEdit, product, isLicense }: { isEdit: boolean; product?: IProductModel | null; isLicense: boolean }) => {
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
                label={isLicense ? "License Keys / Activation IDs (one per line)" : "Serial Numbers (one per line)"}
                placeholder={isLicense ? "SW-LIC-1001\nSW-LIC-1002" : "SN1001\nSN1002\nSN1003"}
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
                {isLicense ? "Licenses" : "Quantity"}: <span className="font-semibold text-slate-700">{count.toLocaleString("en-IN")}</span>
                {isLicense ? (count === 1 ? " license" : " licenses") : count === 1 ? " unit" : " units"}
                {isChecking && <span className="ml-2 text-slate-400">Checking serial numbers...</span>}
            </p>
        </div>
    );
};

const AddProductForm = ({ open, onClose, onSaved, scope, product, softwareOnly = false }: AddProductFormProps) => {
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
            productType: product?.productType ?? (softwareOnly ? "Software" : "Standard"),
            licenseReassignable: product?.licenseReassignable ?? false,
            serialNumbers: serialTextIn(product, branchId),
            quantity: quantityIn(product, branchId) ?? "",
            branchId,
            supplierName: "",
            purchaseDate: format(new Date(), DATE_VALUE_FORMAT),
            unitAmount: "",
            purchaseReference: "",
        };
    }, [isAdmin, scope.branchId, product, softwareOnly]);

    const { mutate: saveProduct, isPending } = useMutation({
        mutationFn: (values: IProductFormValues) => {
            const body: IProductCreateModel = {
                name: values.name.trim(),
                branchId: Number(values.branchId),
                ...(usesSerials(values.productType) && { serialNumbers: splitSerialNumbers(values.serialNumbers) }),
                ...(values.productType === "Standard" && { quantity: Number(values.quantity) }),
                // The product's type is only chosen when it is first added
                ...(!product && { productType: values.productType, hasSerialNumber: usesSerials(values.productType) }),
                // License terms: set when adding, and changeable later by admins
                ...(values.productType === "Software" && (!product || isAdmin) && { licenseReassignable: values.licenseReassignable }),
                ...(!product && usesSerials(values.productType) && {
                    purchase: {
                        supplierName: values.supplierName.trim() || undefined,
                        purchaseDate: values.purchaseDate || undefined,
                        unitAmount: values.unitAmount === "" ? undefined : Number(values.unitAmount),
                        reference: values.purchaseReference.trim() || undefined,
                    },
                }),
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
        <Dialog
            open={open}
            onClose={onClose}
            title={softwareOnly ? (isEdit ? "Edit Software & License Keys" : "Add Software") : isEdit ? "Edit Product Stock" : "Add Product"}
            preventClose={isPending}
        >
            <Formik
                initialValues={initialValues}
                validationSchema={isEdit ? productSchema : addProductSchema}
                onSubmit={(values) => saveProduct(values)}
            >
                {({ values }) => (
                    <Form className="flex flex-col gap-4" noValidate>
                        {product && isAdmin && <BranchQuantitySync product={product} />}
                        <div className="flex flex-col gap-1">
                            <Field
                                id="name"
                                name="name"
                                label={softwareOnly ? "Software Name" : "Product Name"}
                                placeholder={softwareOnly ? "e.g. Diagnostic Software Pro" : "Enter product name"}
                                // The name is shared by every branch, so only admins may rename
                                disabled={isEdit && !isAdmin}
                                component={Input}
                                autoFocus={!isEdit}
                            />
                            {isEdit && !isAdmin && (
                                <p className="px-1 text-xs text-slate-500">Only an admin can rename a product.</p>
                            )}
                        </div>
                        {!isEdit && !softwareOnly && (
                            <div className="flex flex-col gap-1">
                                <Field id="productType" name="productType" label="Product Type" options={TYPE_OPTIONS} component={Select} />
                                <p className="px-1 text-xs text-slate-500">
                                    {TYPE_HINT[values.productType]} Can't be changed later; an existing product keeps its own type. Software licenses are added from the Software Licenses page.
                                </p>
                            </div>
                        )}
                        {!isEdit && softwareOnly && (
                            <p className="-mt-1 px-1 text-xs text-slate-500">{TYPE_HINT.Software} If this software already exists, the keys are added to it.</p>
                        )}
                        {isEdit && !softwareOnly && (
                            <p className="-mt-1 px-1 text-xs text-slate-500">Type: <span className="font-semibold text-slate-700">{PRODUCT_TYPE_LABEL[values.productType]}</span></p>
                        )}
                        {values.productType === "Software" && (!isEdit || isAdmin) && (
                            <div className="flex flex-col gap-1">
                                <Field
                                    id="licenseReassignable"
                                    name="licenseReassignable"
                                    label="Returned licenses can be sold again"
                                    onLabel="Yes, reassignable"
                                    offLabel="No, single-use"
                                    component={Switch}
                                />
                                <p className="px-1 text-xs text-slate-500">
                                    Single-use licenses are deactivated for good when returned or cancelled.
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
                            {values.productType === "Standard" && (
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
                        {usesSerials(values.productType) && <SerialNumbersField isEdit={isEdit} product={product} isLicense={values.productType === "Software"} />}
                        {usesSerials(values.productType) && !isEdit && <PurchaseFields isLicense={values.productType === "Software"} />}
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
