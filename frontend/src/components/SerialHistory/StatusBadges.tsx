import clsx from "clsx";
import type { SerialStatus, SerialUnitType } from "@/models/Serial";
import type { ReturnStatus } from "@/models/SaleReturn";
import { RETURN_STATUS_CLASS, RETURN_STATUS_LABEL, SERIAL_STATUS_CLASS, UNIT_TYPE_CLASS, UNIT_TYPE_LABEL, statusLabel } from "./serialDisplay";

const badge = "inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ring-1";

// unitType gives licenses and installations their own wording (e.g. "Assigned" instead of "Sold")
export const SerialStatusBadge = ({ status, unitType, className }: { status: SerialStatus; unitType?: SerialUnitType; className?: string }) => (
    <span className={clsx(badge, SERIAL_STATUS_CLASS[status] ?? SERIAL_STATUS_CLASS.Removed, className)}>
        {statusLabel(status, unitType)}
    </span>
);

export const UnitTypeTag = ({ unitType }: { unitType: SerialUnitType }) => (
    <span className={clsx("inline-flex rounded-md px-1.5 py-0.5 text-[11px] font-medium", UNIT_TYPE_CLASS[unitType])}>{UNIT_TYPE_LABEL[unitType]}</span>
);

export const ReturnStatusBadge = ({ status }: { status: ReturnStatus }) => (
    <span className={clsx(badge, RETURN_STATUS_CLASS[status] ?? RETURN_STATUS_CLASS.Rejected)}>{RETURN_STATUS_LABEL[status] ?? status}</span>
);
