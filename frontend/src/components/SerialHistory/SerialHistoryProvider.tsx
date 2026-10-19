import { useCallback, useMemo, useState, type ReactNode } from "react";
import { SerialHistoryContext } from "./SerialHistoryContext";
import SerialHistoryDialog from "./SerialHistoryDialog";

// Lets any page open a serial number's history (see SerialLink) without managing the dialog itself
const SerialHistoryProvider = ({ children }: { children: ReactNode }) => {
    const [serialNumber, setSerialNumber] = useState<string | null>(null);
    const [changeCount, setChangeCount] = useState(0);

    const openHistory = useCallback((sn: string) => setSerialNumber(sn), []);
    const value = useMemo(() => ({ openHistory, changeCount }), [openHistory, changeCount]);

    return (
        <SerialHistoryContext.Provider value={value}>
            {children}
            <SerialHistoryDialog
                serialNumber={serialNumber}
                onClose={() => setSerialNumber(null)}
                onChanged={() => setChangeCount((n) => n + 1)}
            />
        </SerialHistoryContext.Provider>
    );
};

export default SerialHistoryProvider;
