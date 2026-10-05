import type { ReactNode } from "react";
import { useSelector } from "react-redux";
import { Navigate } from "react-router-dom";
import type { RootState } from "../store/store";

interface ProtectedRouteProps {
    element: ReactNode;
    /** If set, only these roles (case-insensitive) can open the route */
    roles?: string[];
}

const ProtectedRoute = ({ element, roles }: ProtectedRouteProps) => {
    const role = useSelector((state: RootState) => state.auth.role);

    if (roles && !roles.includes((role ?? "").toLowerCase())) {
        return <Navigate to="/sales" replace />;
    }

    return <>{element}</>
}

export default ProtectedRoute
