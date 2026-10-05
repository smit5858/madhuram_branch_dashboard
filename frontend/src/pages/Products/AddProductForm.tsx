import { Field, Form, Formik, useFormikContext } from "formik";
import { useEffect, useMemo, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Input } from "@/components/formik-fields/Input";
import { Select, type SelectOption } from "@/components/formik-fields/Select";
import { Button } from "@/components/Button";
import { Dialog } from "@/components/Dialog";
import productService from "@/services/product-service";
import { productSchema } from "@/validation/validation";
import type { IProductBranchScopeModel, IProductFormValues, IProductModel } from "@/models/Product";

interface AddProductFormProps {
    open: boolean;
    onClose: () => void;
    onSaved: () => void;
    /** Branches the user may use, from the API */
    scope: IProductBranchScopeModel;
    /** When set the form edits this product's stock, otherwise it adds stock. */
    product?: IProductModel | null;
}

const quantityIn = (product: IProductModel | null | undefined, branchId: string) =>
    product?.stocks.find((s) => String(s.branchId) === branchId)?.quantity;

// When an admin switches branch while editing, load that branch's current quantity
const BranchQuantitySync = ({ product }: { product: IProductModel }) => {
    const { values, setFieldValue } = useFormikContext<IProductFormValues>();
    const previousBranch = useRef(values.branchId);

    useEffect(() => {
        if (values.branchId === previousBranch.current) return;
        previousBranch.current = values.branchId;
        setFieldValue("quantity", quantityIn(product, values.branchId) ?? 0, false);
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
                If this product already exists in {branchName}, the quantity is added to its current stock.
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
            quantity: quantityIn(product, branchId) ?? "",
            branchId,
        };
    }, [isAdmin, scope.branchId, product]);

    const { mutate: saveProduct, isPending } = useMutation({
        mutationFn: (values: IProductFormValues) => {
            const body = {
                name: values.name.trim(),
                quantity: Number(values.quantity),
                branchId: Number(values.branchId),
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
                    </div>
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
            </Formik>
        </Dialog>
    );
};

export default AddProductForm;
