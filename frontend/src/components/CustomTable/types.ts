import type { Key, ReactNode } from "react";

// Rows coming from the API are loosely typed; modules can pass a concrete type via the generic.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyRow = Record<string, any>;

export type SortDirection = "asc" | "desc";

export interface SortState {
    id: string;
    direction: SortDirection;
}

export interface TableColumn<T = AnyRow> {
    /** Key in the row object. Dot paths ("customer.name") read nested values. */
    id: string;
    label: ReactNode;
    /** Custom value getter; overrides the `id` lookup. */
    accessor?: (row: T) => unknown;
    /**
     * Custom cell renderer. Defaults to the formatted `row[column.id]`.
     * `rowIndex` is the 0-based index on the current page; `serialNo` is the 1-based
     * position across all pages (page 2 with 10 rows per page starts at 11).
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    renderCell?: (value: any, row: T, column: TableColumn<T>, rowIndex: number, serialNo: number) => ReactNode;
    sortable?: boolean;
    /** Value used for sorting when it differs from the displayed value. */
    sortValue?: (row: T) => unknown;
    /** Full comparator for ascending order; overrides the built-in comparison. */
    sortFn?: (a: T, b: T) => number;
    /** Initial visibility. Defaults to true. */
    visible?: boolean;
    /** Set to false to keep the column out of the "Columns" menu. */
    hideable?: boolean;
    /** Set to false to prevent dragging this column. */
    draggable?: boolean;
    align?: "left" | "center" | "right";
    width?: number | string;
    className?: string;
    headerClassName?: string;
}

export interface PaginatedResult<T = AnyRow> {
    rows: T[];
    total?: number;
    totalPages?: number;
}

export type RowFetcher = (page: number, limit: number) => unknown;

export interface CustomTableProps<T = AnyRow> {
    column: TableColumn<T>[];
    /** Static rows, or a fetcher called with (page, limit) for server-side pagination. */
    row: T[] | RowFetcher;
    /** Maps the raw fetcher response to rows (or to `{ rows, total, totalPages }`). */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mapResponseToColumns?: (response: any) => T[] | PaginatedResult<T>;
    /** Search text. Changing it resets to page 1 and reloads. */
    searchKey?: string;
    /** Debounce for `searchKey` changes in ms. Defaults to 300. */
    searchDelay?: number;
    /** Change this value to force a reload (e.g. after a delete). */
    refreshKey?: string | number;
    /** Distinguishes cached queries when several tables share a fetcher. */
    queryKey?: string;

    pagination?: boolean;
    defaultPageSize?: number;
    pageSizeOptions?: number[];

    isView?: boolean;
    onView?: (row: T) => void;
    isEdit?: boolean;
    onEdit?: (row: T) => void;
    isDelete?: boolean;
    /** Alias of `isDelete`, kept for existing usages. */
    idDelete?: boolean;
    onDelete?: (row: T) => void;
    actionsLabel?: ReactNode;

    columnReorder?: boolean;
    columnToggle?: boolean;
    onColumnOrderChange?: (ids: string[]) => void;

    getRowId?: (row: T, index: number) => Key;
    onRowClick?: (row: T) => void;
    /** Extra loading flag from the parent (e.g. while a delete is in flight). */
    loading?: boolean;
    emptyMessage?: ReactNode;
    /** Content rendered at the left of the toolbar (e.g. a search input). */
    toolbar?: ReactNode;
    className?: string;
}
