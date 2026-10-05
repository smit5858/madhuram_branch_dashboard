import clsx from "clsx";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";

interface DialogProps {
    open: boolean;
    onClose: () => void;
    title: ReactNode;
    children: ReactNode;
    /** Blocks Escape, backdrop and ✕ closing, e.g. while a request is in flight. */
    preventClose?: boolean;
    className?: string;
}

// Built on the native <dialog>, which gives us the backdrop, focus trapping and Escape handling
export const Dialog = ({ open, onClose, title, children, preventClose = false, className }: DialogProps) => {
    const dialogRef = useRef<HTMLDialogElement>(null);
    // Only close on a backdrop click that also started on the backdrop, so dragging a
    // text selection out of an input doesn't dismiss the dialog.
    const pressedOnBackdrop = useRef(false);
    const titleId = useId();

    useEffect(() => {
        const dialog = dialogRef.current;
        if (!dialog) return;
        if (open && !dialog.open) dialog.showModal();
        else if (!open && dialog.open) dialog.close();
    }, [open]);

    const requestClose = () => {
        if (!preventClose) onClose();
    };

    return (
        <dialog
            ref={dialogRef}
            aria-labelledby={titleId}
            onCancel={(e) => {
                e.preventDefault();
                requestClose();
            }}
            onMouseDown={(e) => {
                pressedOnBackdrop.current = e.target === e.currentTarget;
            }}
            onClick={(e) => {
                if (pressedOnBackdrop.current && e.target === e.currentTarget) requestClose();
            }}
            className={clsx(
                "m-auto w-[calc(100%-2rem)] max-w-lg overflow-visible rounded-2xl bg-white p-0 shadow-xl backdrop:bg-black/40",
                className
            )}
        >
            {/* Mounted only while open so every open starts with fresh content */}
            {open && (
                <div className="flex flex-col gap-5 p-6">
                    <div className="flex items-center justify-between">
                        <h2 id={titleId} className="text-lg font-semibold text-gray-900">{title}</h2>
                        <button
                            type="button"
                            onClick={requestClose}
                            disabled={preventClose}
                            aria-label="Close"
                            className="inline-flex size-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <X className="size-4" />
                        </button>
                    </div>
                    {children}
                </div>
            )}
        </dialog>
    );
};
