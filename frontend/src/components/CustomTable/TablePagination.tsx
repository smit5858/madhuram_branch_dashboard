import clsx from "clsx";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Select } from "@/components/formik-fields/Select";
import { getPageItems } from "./utils";

interface TablePaginationProps {
    page: number;
    pageSize: number;
    pageSizeOptions: number[];
    rowCount: number;
    total?: number;
    totalPages?: number;
    disabled?: boolean;
    onPageChange: (page: number) => void;
    onPageSizeChange: (size: number) => void;
}

const navButton =
    "inline-flex size-8 items-center justify-center rounded-lg text-sm text-slate-600 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent";

const TablePagination = ({
    page,
    pageSize,
    pageSizeOptions,
    rowCount,
    total,
    totalPages,
    disabled,
    onPageChange,
    onPageSizeChange,
}: TablePaginationProps) => {
    const from = rowCount ? (page - 1) * pageSize + 1 : 0;
    const to = (page - 1) * pageSize + rowCount;
    // Without totals from the API, assume another page exists when this one is full.
    const hasNext = totalPages !== undefined ? page < totalPages : rowCount >= pageSize;

    const sizeOptions = [...new Set([...pageSizeOptions, pageSize])]
        .sort((a, b) => a - b)
        .map((n) => ({ value: String(n), label: String(n) }));

    return (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-sm text-slate-600">
            <div className="flex items-center gap-2">
                <span className="whitespace-nowrap">Rows per page</span>
                <Select
                    className="w-20"
                    options={sizeOptions}
                    value={String(pageSize)}
                    disabled={disabled}
                    onChange={(v) => onPageSizeChange(Number(v))}
                />
            </div>

            <span className="whitespace-nowrap">
                {from}–{to}
                {total !== undefined && ` of ${total}`}
            </span>

            <nav aria-label="Pagination" className="flex items-center gap-1">
                <button
                    type="button"
                    className={navButton}
                    aria-label="Previous page"
                    disabled={disabled || page <= 1}
                    onClick={() => onPageChange(page - 1)}
                >
                    <ChevronLeft className="size-4" />
                </button>

                {totalPages !== undefined ? (
                    getPageItems(page, Math.max(totalPages, 1)).map((item, i) =>
                        item === "…" ? (
                            <span key={`gap-${i}`} className="px-1 text-slate-400">…</span>
                        ) : (
                            <button
                                key={item}
                                type="button"
                                disabled={disabled}
                                aria-current={item === page ? "page" : undefined}
                                onClick={() => onPageChange(item)}
                                className={clsx(
                                    navButton,
                                    "min-w-8 px-2",
                                    item === page && "bg-blue-500 font-medium text-white hover:bg-blue-600"
                                )}
                            >
                                {item}
                            </button>
                        )
                    )
                ) : (
                    <span className="px-2">Page {page}</span>
                )}

                <button
                    type="button"
                    className={navButton}
                    aria-label="Next page"
                    disabled={disabled || !hasNext}
                    onClick={() => onPageChange(page + 1)}
                >
                    <ChevronRight className="size-4" />
                </button>
            </nav>
        </div>
    );
};

export default TablePagination;
