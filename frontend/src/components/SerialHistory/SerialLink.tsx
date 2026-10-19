import clsx from "clsx";
import { useSerialHistory } from "./SerialHistoryContext";

interface SerialLinkProps {
    serialNumber: string;
    /** chip: small grey tag (lists of serial numbers); text: inline link */
    variant?: "chip" | "text";
    /** Highlights a chip, e.g. one matching the search */
    highlight?: boolean;
    className?: string;
}

// A serial number that opens its full history when clicked
const SerialLink = ({ serialNumber, variant = "text", highlight = false, className }: SerialLinkProps) => {
    const { openHistory } = useSerialHistory();

    return (
        <button
            type="button"
            title={`View history of ${serialNumber}`}
            onClick={(e) => {
                // Table rows may have their own click handlers
                e.stopPropagation();
                openHistory(serialNumber);
            }}
            className={clsx(
                "cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
                variant === "chip"
                    ? clsx(
                        "rounded-md px-1.5 py-0.5 text-xs transition-colors",
                        highlight
                            ? "bg-amber-100 font-medium text-amber-800 hover:bg-amber-200"
                            : "bg-slate-100 text-slate-600 hover:bg-blue-50 hover:text-blue-700",
                    )
                    : "rounded font-medium text-blue-600 underline-offset-2 hover:text-blue-700 hover:underline",
                className,
            )}
        >
            {serialNumber}
        </button>
    );
};

export default SerialLink;
