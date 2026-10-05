import clsx from "clsx";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ChevronsUpDown, CircleAlert, Eye, GripVertical, Inbox, Pencil, Trash2, type LucideIcon } from "lucide-react";
import { memo, useId, useMemo, useState, type DragEvent, type Key, type ReactNode } from "react";
import { useDebounce } from "@/hook/useDebounce";
import ColumnVisibilityMenu from "./ColumnVisibilityMenu";
import TablePagination from "./TablePagination";
import type { AnyRow, CustomTableProps, PaginatedResult, RowFetcher, SortState, TableColumn } from "./types";
import { filterRows, formatCellValue, getCellValue, mergeOrder, moveItem, normalizeResponse, sortRows } from "./utils";

const ACTIONS_ID = "actions";
const DEFAULT_PAGE_SIZES = [10, 25, 50, 100];

const alignClass = { left: "text-left", center: "text-center", right: "text-right" } as const;

interface DropTarget {
    id: string;
    side: "before" | "after";
}

const ActionButton = ({ label, icon: Icon, className, onClick }: { label: string; icon: LucideIcon; className: string; onClick: () => void }) => (
    <button
        type="button"
        title={label}
        aria-label={label}
        onClick={(e) => {
            e.stopPropagation();
            onClick();
        }}
        className={clsx("inline-flex size-8 items-center justify-center rounded-lg transition-colors", className)}
    >
        <Icon className="size-4" />
    </button>
);

function CustomTable<T extends AnyRow = AnyRow>({
    column: columnProp = [],
    row,
    mapResponseToColumns,
    searchKey = "",
    searchDelay = 300,
    refreshKey,
    queryKey,
    pagination = true,
    defaultPageSize = 10,
    pageSizeOptions = DEFAULT_PAGE_SIZES,
    isView,
    onView,
    isEdit,
    onEdit,
    isDelete,
    idDelete,
    onDelete,
    actionsLabel = "Actions",
    columnReorder = true,
    columnToggle = true,
    onColumnOrderChange,
    getRowId,
    onRowClick,
    loading: externalLoading = false,
    emptyMessage = "No records found",
    toolbar,
    className,
}: CustomTableProps<T>) {
    const isServer = typeof row === "function";
    const search = useDebounce(searchKey.trim(), searchDelay);
    const instanceId = useId();

    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(defaultPageSize);
    const [sort, setSort] = useState<SortState | null>(null);
    const [savedOrder, setSavedOrder] = useState<string[]>([]);
    const [visibility, setVisibility] = useState<Record<string, boolean>>({});
    const [dragId, setDragId] = useState<string | null>(null);
    const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);

    // A new search always starts from page 1. Adjusting state during render (rather than
    // in an effect) means the fetch only ever runs once, with both the new search and page.
    const [lastSearch, setLastSearch] = useState(search);
    if (search !== lastSearch) {
        setLastSearch(search);
        setPage(1);
    }

    // ---- Data loading -------------------------------------------------------------------
    // The fetcher itself is not part of the key, so passing a new inline arrow on every
    // parent render does not trigger extra API calls; only page/limit/search/refresh do.
    const query = useQuery<PaginatedResult<T>>({
        queryKey: ["custom-table", queryKey ?? instanceId, page, pageSize, search, refreshKey],
        queryFn: async () => {
            const response = await (row as RowFetcher)(page, pageSize);
            // The http-service interceptors resolve to undefined on handled errors.
            if (response === undefined || response === null) throw new Error("Failed to load data.");
            const base = normalizeResponse<T>(response);
            if (!mapResponseToColumns) return base;
            const mapped = mapResponseToColumns(response);
            return Array.isArray(mapped) ? { ...base, rows: mapped } : { ...base, ...mapped, rows: mapped?.rows ?? [] };
        },
        enabled: isServer,
        placeholderData: keepPreviousData,
        retry: false,
        refetchOnWindowFocus: false,
    });

    // ---- Columns ------------------------------------------------------------------------
    const showView = !!isView;
    const showEdit = !!isEdit;
    const showDelete = !!(isDelete || idDelete);
    const hasActions = showView || showEdit || showDelete;

    const renderActions = (r: T) => (
        <div className="inline-flex items-center gap-1">
            {showView && <ActionButton label="View" icon={Eye} onClick={() => onView?.(r)} className="text-slate-500 hover:bg-slate-100 hover:text-slate-800" />}
            {showEdit && <ActionButton label="Edit" icon={Pencil} onClick={() => onEdit?.(r)} className="text-blue-500 hover:bg-blue-50 hover:text-blue-600" />}
            {showDelete && <ActionButton label="Delete" icon={Trash2} onClick={() => onDelete?.(r)} className="text-red-500 hover:bg-red-50 hover:text-red-600" />}
        </div>
    );

    // A column with id "actions" and its own renderCell always wins. Without renderCell it
    // gets the built-in buttons, which lets a module choose where the actions column sits.
    let allColumns: TableColumn<T>[] = columnProp;
    if (hasActions) {
        const builtIn: TableColumn<T> = {
            id: ACTIONS_ID,
            label: actionsLabel,
            align: "right",
            hideable: false,
            renderCell: (_, r) => renderActions(r),
        };
        allColumns = columnProp.some((c) => c.id === ACTIONS_ID)
            ? columnProp.map((c) => (c.id === ACTIONS_ID && !c.renderCell ? { ...builtIn, ...c, renderCell: builtIn.renderCell } : c))
            : [...columnProp, builtIn];
    }

    const columnById = new Map(allColumns.map((c) => [c.id, c]));
    const order = mergeOrder(savedOrder, allColumns.map((c) => c.id));
    const orderedColumns = order.map((id) => columnById.get(id)!);
    const isVisible = (c: TableColumn<T>) => visibility[c.id] ?? c.visible !== false;
    const visibleColumns = orderedColumns.filter(isVisible);

    const sortColumn = sort ? allColumns.find((c) => c.id === sort.id && c.sortable) : undefined;

    // ---- Rows (sorting is always local, never an API call) --------------------------------
    const staticRows = useMemo(() => (isServer ? [] : ((row as T[] | undefined) ?? [])), [isServer, row]);
    const filteredStatic = isServer ? staticRows : filterRows(staticRows, visibleColumns, search);

    let displayRows: T[];
    let total: number | undefined;
    let totalPages: number | undefined;

    if (isServer) {
        displayRows = sortRows(query.data?.rows ?? [], sortColumn, sort);
        total = query.data?.total;
        totalPages = query.data?.totalPages ?? (total !== undefined ? Math.ceil(total / pageSize) : undefined);
    } else {
        const sorted = sortRows(filteredStatic, sortColumn, sort);
        total = sorted.length;
        totalPages = Math.max(1, Math.ceil(total / pageSize));
        displayRows = pagination ? sorted.slice((page - 1) * pageSize, page * pageSize) : sorted;
    }

    // e.g. deleting the last row of the last page: step back to a page that exists.
    if (pagination && totalPages !== undefined && totalPages > 0 && page > totalPages && !query.isPlaceholderData) {
        setPage(totalPages);
    }

    const isInitialLoading = isServer && query.isPending;
    const isError = isServer && query.isError;
    const isRefreshing = externalLoading || (isServer && query.isFetching && !query.isPending);

    // ---- Handlers -----------------------------------------------------------------------
    const toggleSort = (id: string) =>
        setSort((prev) => {
            if (!prev || prev.id !== id) return { id, direction: "asc" };
            return prev.direction === "asc" ? { id, direction: "desc" } : null;
        });

    const canDrag = (c: TableColumn<T>) => columnReorder && c.draggable !== false;

    const endDrag = () => {
        setDragId(null);
        setDropTarget(null);
    };

    const handleDragStart = (e: DragEvent<HTMLTableCellElement>, id: string) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", id);
        setDragId(id);
    };

    const handleDragOver = (e: DragEvent<HTMLTableCellElement>, id: string) => {
        if (!dragId) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (id === dragId) {
            if (dropTarget) setDropTarget(null);
            return;
        }
        const rect = e.currentTarget.getBoundingClientRect();
        const side = e.clientX < rect.left + rect.width / 2 ? "before" : "after";
        if (dropTarget?.id !== id || dropTarget.side !== side) setDropTarget({ id, side });
    };

    const handleDrop = (e: DragEvent<HTMLTableCellElement>) => {
        e.preventDefault();
        if (dragId && dropTarget) {
            const next = moveItem(order, dragId, dropTarget.id, dropTarget.side);
            setSavedOrder(next);
            onColumnOrderChange?.(next);
        }
        endDrag();
    };

    const resetColumns = () => {
        setSavedOrder([]);
        setVisibility({});
        setSort(null);
    };

    const rowKey = (r: T, index: number): Key => getRowId?.(r, index) ?? r?.id ?? r?._id ?? index;

    // ---- Render -------------------------------------------------------------------------
    const colSpan = Math.max(visibleColumns.length, 1);

    const renderStateRow = (content: ReactNode) => (
        <tr>
            <td colSpan={colSpan} className="px-4 py-12 text-center text-sm text-slate-500">
                {content}
            </td>
        </tr>
    );

    let body: ReactNode;
    if (isInitialLoading) {
        body = Array.from({ length: Math.min(pageSize, 8) }, (_, i) => (
            <tr key={i} className="border-t border-slate-100">
                {visibleColumns.map((c) => (
                    <td key={c.id} className="px-4 py-3.5">
                        <div className="h-3.5 w-3/4 animate-pulse rounded bg-slate-100" />
                    </td>
                ))}
            </tr>
        ));
    } else if (isError) {
        const message = query.error instanceof Error ? query.error.message : String(query.error ?? "");
        body = renderStateRow(
            <div className="flex flex-col items-center gap-2">
                <CircleAlert className="size-6 text-red-400" />
                <span>{message || "Something went wrong while loading data."}</span>
                <button
                    type="button"
                    onClick={() => query.refetch()}
                    className="mt-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                    Try again
                </button>
            </div>
        );
    } else if (displayRows.length === 0) {
        body = renderStateRow(
            <div className="flex flex-col items-center gap-2">
                <Inbox className="size-6 text-slate-300" />
                <span>{emptyMessage}</span>
            </div>
        );
    } else {
        body = displayRows.map((r, rowIndex) => (
            <tr
                key={rowKey(r, rowIndex)}
                onClick={onRowClick ? () => onRowClick(r) : undefined}
                className={clsx("border-t border-slate-100 transition-colors hover:bg-slate-50/70", onRowClick && "cursor-pointer")}
            >
                {visibleColumns.map((c) => {
                    const value = getCellValue(r, c);
                    const serialNo = (page - 1) * pageSize + rowIndex + 1;
                    const content = c.renderCell ? c.renderCell(value, r, c, rowIndex, serialNo) : formatCellValue(value);
                    return (
                        <td key={c.id} className={clsx("px-4 py-3 text-slate-700", alignClass[c.align ?? "left"], c.className)}>
                            {content ?? (c.renderCell ? null : <span className="text-slate-300">—</span>)}
                        </td>
                    );
                })}
            </tr>
        ));
    }

    const hideableItems = orderedColumns
        .filter((c) => c.hideable !== false)
        .map((c) => ({ id: c.id, label: c.label, visible: isVisible(c) }));

    return (
        <div className={clsx("rounded-2xl border border-slate-200 bg-white", className)}>
            {(toolbar || (columnToggle && hideableItems.length > 0)) && (
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
                    <div className="min-w-0 flex-1">{toolbar}</div>
                    {columnToggle && hideableItems.length > 0 && (
                        <ColumnVisibilityMenu
                            items={hideableItems}
                            onToggle={(id, visible) => setVisibility((v) => ({ ...v, [id]: visible }))}
                            onReset={resetColumns}
                        />
                    )}
                </div>
            )}

            <div className="relative overflow-x-auto">
                {isRefreshing && <div className="absolute inset-x-0 top-0 z-10 h-0.5 animate-pulse bg-blue-500" />}
                <table className="w-full border-collapse text-sm">
                    <thead className="bg-slate-50">
                        <tr>
                            {visibleColumns.map((c) => {
                                const sorted = sortColumn?.id === c.id ? sort?.direction : undefined;
                                const SortIcon = sorted === "asc" ? ArrowUp : sorted === "desc" ? ArrowDown : ChevronsUpDown;
                                const draggable = canDrag(c);
                                return (
                                    <th
                                        key={c.id}
                                        scope="col"
                                        style={{ width: c.width }}
                                        draggable={draggable}
                                        onDragStart={draggable ? (e) => handleDragStart(e, c.id) : undefined}
                                        onDragOver={(e) => handleDragOver(e, c.id)}
                                        onDrop={handleDrop}
                                        onDragEnd={endDrag}
                                        aria-sort={c.sortable ? (sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : "none") : undefined}
                                        className={clsx(
                                            "group/th relative select-none whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500",
                                            alignClass[c.align ?? "left"],
                                            draggable && "cursor-grab active:cursor-grabbing",
                                            dragId === c.id && "opacity-40",
                                            c.headerClassName
                                        )}
                                    >
                                        {dropTarget?.id === c.id && (
                                            <span
                                                aria-hidden="true"
                                                className={clsx(
                                                    "absolute inset-y-1 w-0.5 rounded-full bg-blue-500",
                                                    dropTarget.side === "before" ? "left-0" : "right-0"
                                                )}
                                            />
                                        )}
                                        <span className="inline-flex items-center gap-1">
                                            {draggable && (
                                                <GripVertical aria-hidden="true" className="-ml-2 size-3.5 text-slate-300 opacity-0 transition-opacity group-hover/th:opacity-100" />
                                            )}
                                            {c.sortable ? (
                                                <button
                                                    type="button"
                                                    onClick={() => toggleSort(c.id)}
                                                    className={clsx(
                                                        "inline-flex items-center gap-1 uppercase tracking-wide transition-colors hover:text-slate-800",
                                                        sorted && "text-slate-800"
                                                    )}
                                                >
                                                    {c.label}
                                                    <SortIcon className={clsx("size-3.5", !sorted && "text-slate-300")} />
                                                </button>
                                            ) : (
                                                c.label
                                            )}
                                        </span>
                                    </th>
                                );
                            })}
                        </tr>
                    </thead>
                    <tbody className={clsx("transition-opacity", isRefreshing && !isInitialLoading && "opacity-60")}>{body}</tbody>
                </table>
            </div>

            {pagination && !isInitialLoading && !isError && (
                <TablePagination
                    page={page}
                    pageSize={pageSize}
                    pageSizeOptions={pageSizeOptions}
                    rowCount={displayRows.length}
                    total={total}
                    totalPages={totalPages}
                    disabled={isServer && query.isFetching}
                    onPageChange={setPage}
                    onPageSizeChange={(size) => {
                        setPageSize(size);
                        setPage(1);
                    }}
                />
            )}
        </div>
    );
}

// memo() drops generics, so cast back to keep `CustomTable<MyRow>` typing at call sites.
export default memo(CustomTable) as typeof CustomTable;
