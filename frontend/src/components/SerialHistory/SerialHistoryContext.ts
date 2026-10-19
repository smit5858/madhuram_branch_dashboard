import { createContext, useContext } from "react";

export interface SerialHistoryContextValue {
    /** Opens the history dialog of this serial number */
    openHistory: (serialNumber: string) => void;
    /** Bumped after a return or transfer is saved from the dialog, so pages can reload */
    changeCount: number;
}

export const SerialHistoryContext = createContext<SerialHistoryContextValue | null>(null);

/** Needs SerialHistoryProvider above (MainLayout provides it for every page) */
export const useSerialHistory = () => {
    const value = useContext(SerialHistoryContext);
    if (!value) throw new Error("useSerialHistory must be used inside SerialHistoryProvider");
    return value;
};
