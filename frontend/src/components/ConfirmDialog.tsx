import type { ReactNode } from "react";
import { Dialog } from "./Dialog";
import { Button } from "./Button";

interface ConfirmDialogProps {
    open: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: ReactNode;
    message: ReactNode;
    confirmLabel?: string;
    cancelLabel?: string;
    loading?: boolean;
}

export const ConfirmDialog = ({
    open,
    onClose,
    onConfirm,
    title,
    message,
    confirmLabel = "Delete",
    cancelLabel = "Cancel",
    loading = false,
}: ConfirmDialogProps) => (
    <Dialog open={open} onClose={onClose} title={title} preventClose={loading} className="max-w-md">
        <p className="text-sm text-gray-600">{message}</p>
        <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
                onClick={onClose}
                disabled={loading}
                className="sm:w-auto bg-gray-100! text-gray-700! hover:bg-gray-200! focus-visible:ring-gray-400!"
            >
                {cancelLabel}
            </Button>
            <Button
                onClick={onConfirm}
                loading={loading}
                className="sm:w-auto bg-red-500! hover:bg-red-600! focus-visible:ring-red-500! disabled:hover:bg-red-500!"
            >
                {confirmLabel}
            </Button>
        </div>
    </Dialog>
);
