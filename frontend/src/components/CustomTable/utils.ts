import { isValidElement, type ReactNode } from "react";
import type { AnyRow, PaginatedResult, SortState, TableColumn } from "./types";

const ROW_KEYS = ["data", "rows", "items", "results", "records", "list", "docs"];
const TOTAL_KEYS = ["total", "totalCount", "totalRecords", "totalItems", "totalDocs", "count"];
const TOTAL_PAGE_KEYS = ["totalPages", "pageCount", "lastPage", "pages"];
const META_KEYS = ["pagination", "meta", "pageInfo"];

const isObject = (v: unknown): v is AnyRow => typeof v === "object" && v !== null && !Array.isArray(v);

const toFiniteNumber = (v: unknown): number | undefined => {
    const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
    return typeof n === "number" && Number.isFinite(n) ? n : undefined;
};

const pickNumber = (sources: AnyRow[], keys: string[]) => {
    for (const source of sources) {
        for (const key of keys) {
            const n = toFiniteNumber(source[key]);
            if (n !== undefined) return n;
        }
    }
    return undefined;
};

const isAxiosResponse = (v: unknown): v is { data: unknown } =>
    isObject(v) && "data" in v && "status" in v && "headers" in v && "config" in v;

/**
 * Accepts the common response shapes (plain array, AxiosResponse, `{ data: [...] }`,
 * `{ data: { items, total } }`, `{ rows, pagination: { total } }`, ...) and extracts
 * the rows plus whatever paging metadata exists.
 */
export function normalizeResponse<T>(response: unknown): PaginatedResult<T> {
    const body = isAxiosResponse(response) ? response.data : response;
    if (Array.isArray(body)) return { rows: body as T[] };

    const metaSources: AnyRow[] = [];
    let rows: T[] = [];
    let current: unknown = body;

    for (let depth = 0; depth < 4 && isObject(current); depth++) {
        const node: AnyRow = current;
        metaSources.unshift(node, ...META_KEYS.map((k) => node[k]).filter(isObject));

        const arrayKey = ROW_KEYS.find((k) => Array.isArray(node[k]));
        if (arrayKey) {
            rows = node[arrayKey];
            break;
        }
        current = ROW_KEYS.map((k) => node[k]).find(isObject);
    }

    return {
        rows,
        total: pickNumber(metaSources, TOTAL_KEYS),
        totalPages: pickNumber(metaSources, TOTAL_PAGE_KEYS),
    };
}

export function getValueByPath(row: unknown, path: string): unknown {
    if (!isObject(row)) return undefined;
    if (path in row) return row[path];
    return path.split(".").reduce<unknown>((acc, key) => (isObject(acc) || Array.isArray(acc) ? (acc as AnyRow)[key] : undefined), row);
}

export const getCellValue = <T,>(row: T, column: TableColumn<T>) =>
    column.accessor ? column.accessor(row) : getValueByPath(row, column.id);

const stringify = (v: unknown) => {
    try {
        return JSON.stringify(v);
    } catch {
        return String(v);
    }
};

export function formatCellValue(value: unknown): ReactNode {
    if (value === null || value === undefined || value === "") return null;
    if (isValidElement(value)) return value;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toLocaleString();
    if (typeof value === "boolean") return value ? "Yes" : "No";
    if (Array.isArray(value)) return value.map((v) => (typeof v === "object" && v !== null ? stringify(v) : String(v))).join(", ");
    if (typeof value === "object") return stringify(value);
    return String(value);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

function toComparable(value: unknown): number | string | null {
    if (value === null || value === undefined) return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getTime();
    if (typeof value === "number") return Number.isNaN(value) ? null : value;
    if (typeof value === "boolean") return value ? 1 : 0;
    if (typeof value === "string") {
        const s = value.trim();
        if (s === "") return null;
        if (ISO_DATE.test(s)) {
            const time = Date.parse(s);
            if (!Number.isNaN(time)) return time;
        }
        const n = Number(s);
        return Number.isNaN(n) ? s : n;
    }
    return typeof value === "object" ? stringify(value) : String(value);
}

/** Sorts a copy of `rows`. Empty values always go last, regardless of direction. */
export function sortRows<T>(rows: T[], column: TableColumn<T> | undefined, sort: SortState | null): T[] {
    if (!sort || !column) return rows;
    const dir = sort.direction === "asc" ? 1 : -1;

    if (column.sortFn) return [...rows].sort((a, b) => column.sortFn!(a, b) * dir);

    const getter = column.sortValue ?? ((r: T) => getCellValue(r, column));
    return rows
        .map((row) => ({ row, key: toComparable(getter(row)) }))
        .sort((a, b) => {
            if (a.key === null) return b.key === null ? 0 : 1;
            if (b.key === null) return -1;
            const cmp = typeof a.key === "number" && typeof b.key === "number"
                ? a.key - b.key
                : collator.compare(String(a.key), String(b.key));
            return cmp * dir;
        })
        .map(({ row }) => row);
}

/** Client-side search for static rows: matches any visible column's text. */
export function filterRows<T>(rows: T[], columns: TableColumn<T>[], search: string): T[] {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) =>
        columns.some((col) => {
            const text = formatCellValue(getCellValue(row, col));
            return typeof text === "string" && text.toLowerCase().includes(term);
        })
    );
}

/** Keeps a saved column order in sync with the current column ids. */
export function mergeOrder(saved: string[], ids: string[]): string[] {
    const known = new Set(ids);
    const kept = saved.filter((id) => known.has(id));
    const keptSet = new Set(kept);
    return [...kept, ...ids.filter((id) => !keptSet.has(id))];
}

export function moveItem(order: string[], from: string, to: string, side: "before" | "after"): string[] {
    if (from === to) return order;
    const next = order.filter((id) => id !== from);
    const index = next.indexOf(to);
    if (index === -1) return order;
    next.splice(side === "before" ? index : index + 1, 0, from);
    return next;
}

/** Page list with ellipses, e.g. [1, "…", 4, 5, 6, "…", 12]. */
export function getPageItems(current: number, total: number): (number | "…")[] {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const start = Math.max(2, Math.min(current - 1, total - 4));
    const end = Math.min(total - 1, Math.max(current + 1, 5));
    const items: (number | "…")[] = [1];
    if (start > 2) items.push("…");
    for (let p = start; p <= end; p++) items.push(p);
    if (end < total - 1) items.push("…");
    items.push(total);
    return items;
}
