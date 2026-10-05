import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Dialog } from "@/components/Dialog";
import { Button } from "@/components/Button";
import { Select, type SelectOption } from "@/components/formik-fields/Select";
import productService from "@/services/product-service";
import type { IProductModel } from "@/models/Product";

const ALL_BRANCHES = "all";

interface DeleteProductDialogProps {
    product: IProductModel | null;
    isAdmin: boolean;
    onClose: () => void;
    onDeleted: () => void;
}

// Branch members only ever have their own branch's stock in the row, so they delete that.
// Admins choose one branch's stock or the whole product.
const DeleteProductDialog = ({ product, isAdmin, onClose, onDeleted }: DeleteProductDialogProps) => {
    const stocks = useMemo(() => product?.stocks ?? [], [product]);
    const [target, setTarget] = useState("");
    // Reset the choice whenever a different product is opened, defaulting to the first branch
    const [lastProductId, setLastProductId] = useState<number | null>(null);
    if ((product?.id ?? null) !== lastProductId) {
        setLastProductId(product?.id ?? null);
        setTarget(stocks[0] ? String(stocks[0].branchId) : ALL_BRANCHES);
    }

    const options = useMemo<SelectOption[]>(() => [
        ...stocks.map((s) => ({ value: String(s.branchId), label: `${s.branchName ?? "Branch"} (qty ${s.quantity})` })),
        ...(stocks.length > 1 ? [{ value: ALL_BRANCHES, label: "All branches (delete product)" }] : []),
    ], [stocks]);

    const { mutate: removeProduct, isPending } = useMutation({
        mutationFn: ({ id, branchId }: { id: number; branchId?: number }) => productService.deleteProduct(id, branchId),
        onSuccess: (response) => {
            // http-service shows its own toast and resolves undefined for handled API errors
            if (response?.data?.status) {
                toast.success(response.data.message || "Product deleted successfully");
                onDeleted();
                onClose();
            }
        },
        onError: (error) => {
            toast.error(typeof error === "string" ? error : "Something went wrong");
        },
    });

    const deleteAll = isAdmin && target === ALL_BRANCHES;
    const selectedStock = stocks.find((s) => String(s.branchId) === target) ?? stocks[0];

    const handleConfirm = () => {
        if (!product) return;
        removeProduct({ id: product.id, branchId: deleteAll ? undefined : selectedStock?.branchId });
    };

    return (
        <Dialog open={!!product} onClose={onClose} title="Delete Product Stock" preventClose={isPending} className="max-w-md">
            {isAdmin && options.length > 1 && (
                <Select
                    name="deleteBranch"
                    label="Delete from"
                    options={options}
                    value={target}
                    onChange={setTarget}
                    disabled={isPending}
                />
            )}
            <p className="text-sm text-gray-600">
                {deleteAll ? (
                    <>
                        Are you sure you want to permanently delete <span className="font-semibold text-gray-900">{product?.name}</span> and its stock in <span className="font-semibold text-gray-900">every branch</span>? This cannot be undone.
                    </>
                ) : (
                    <>
                        Are you sure you want to permanently delete the stock of <span className="font-semibold text-gray-900">{product?.name}</span> in <span className="font-semibold text-gray-900">{selectedStock?.branchName ?? "this branch"}</span>? Other branches are not affected. This cannot be undone.
                    </>
                )}
            </p>
            <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                    onClick={onClose}
                    disabled={isPending}
                    className="sm:w-auto bg-gray-100! text-gray-700! hover:bg-gray-200! focus-visible:ring-gray-400!"
                >
                    Cancel
                </Button>
                <Button
                    onClick={handleConfirm}
                    loading={isPending}
                    className="sm:w-auto bg-red-500! hover:bg-red-600! focus-visible:ring-red-500! disabled:hover:bg-red-500!"
                >
                    Delete
                </Button>
            </div>
        </Dialog>
    );
};

export default DeleteProductDialog;
