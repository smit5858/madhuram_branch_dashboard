import clsx from "clsx";
import { Columns3, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

export interface ColumnMenuItem {
    id: string;
    label: ReactNode;
    visible: boolean;
}

interface ColumnVisibilityMenuProps {
    items: ColumnMenuItem[];
    onToggle: (id: string, visible: boolean) => void;
    onReset: () => void;
}

const ColumnVisibilityMenu = ({ items, onToggle, onReset }: ColumnVisibilityMenuProps) => {
    const [open, setOpen] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const visibleCount = items.filter((i) => i.visible).length;

    useEffect(() => {
        if (!open) return;
        const handleClick = (e: MouseEvent) => {
            if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
        };
        const handleKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
        document.addEventListener("mousedown", handleClick);
        document.addEventListener("keydown", handleKey);
        return () => {
            document.removeEventListener("mousedown", handleClick);
            document.removeEventListener("keydown", handleKey);
        };
    }, [open]);

    return (
        <div ref={wrapperRef} className="relative">
            <button
                type="button"
                aria-haspopup="true"
                aria-expanded={open}
                onClick={() => setOpen((o) => !o)}
                className={clsx(
                    "inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-medium text-slate-700 transition-colors",
                    open ? "bg-slate-100" : "bg-white hover:bg-slate-50"
                )}
            >
                <Columns3 className="size-4" />
                Columns
            </button>

            {open && (
                <div className="absolute right-0 top-full z-50 mt-2 w-56 rounded-xl border border-slate-100 bg-white p-1 shadow-lg shadow-black/5">
                    <ul className="max-h-72 overflow-auto">
                        {items.map((item) => {
                            // Keep at least one column on screen.
                            const locked = item.visible && visibleCount <= 1;
                            return (
                                <li key={item.id}>
                                    <label
                                        className={clsx(
                                            "flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50",
                                            locked && "cursor-not-allowed opacity-50"
                                        )}
                                    >
                                        <input
                                            type="checkbox"
                                            className="size-4 accent-blue-500"
                                            checked={item.visible}
                                            disabled={locked}
                                            onChange={(e) => onToggle(item.id, e.target.checked)}
                                        />
                                        <span className="truncate">{item.label}</span>
                                    </label>
                                </li>
                            );
                        })}
                    </ul>
                    <div className="mt-1 border-t border-slate-100 pt-1">
                        <button
                            type="button"
                            onClick={onReset}
                            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
                        >
                            <RotateCcw className="size-3.5" />
                            Reset columns
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ColumnVisibilityMenu;
