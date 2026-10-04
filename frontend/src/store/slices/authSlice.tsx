import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export interface AuthRoute {
    id: number;
    name: string;
    path: string;
}

/** Full permission entry for a single route — loaded once after login */
export interface RoutePermission {
    routeId: number;
    routeName: string;
    routePath: string;
    canRead: boolean;
    canCreate: boolean;
    canUpdate: boolean;
    canDelete: boolean;
    /** Sees ALL records on this module (e.g. all Sales/Couriers), not just its own */
    viewAllRecords: boolean;
}

export interface AuthState {
    userId: number | null;
    name: string | null;
    role: string | null;
    mail: string | null;
    phone: string | null;
    token: string | null;
    refreshToken: string | null;
    allowedCity: string | null;
    /** Sidebar-visible routes (canRead === true) — derived from permissions on login */
    allowedRoutes: AuthRoute[] | null;
    /** Full permission set for all routes — loaded ONCE after login */
    permissions: RoutePermission[] | null;
    unauthorized: boolean;
}

const defaultAuthState: AuthState = {
    userId: null,
    name: null,
    role: null,
    mail: null,
    phone: null,
    token: null,
    refreshToken: null,
    allowedCity: null,
    allowedRoutes: null,
    permissions: null,
    unauthorized: false,
};

const savedAuth = sessionStorage.getItem("auth");

const initialState: AuthState = savedAuth
    ? JSON.parse(savedAuth)
    : defaultAuthState;

const authSlice = createSlice({
    name: "auth",
    initialState,

    reducers: {
        login: (state, action: PayloadAction<{
            userId: number;
            name: string;
            role: string;
            mail: string;
            phone: string | null;
            token: string;
            refreshToken?: string | null;
            allowedCity?: string | null;
        }>) => {
            state.userId = action.payload.userId;
            state.name = action.payload.name;
            state.role = action.payload.role;
            state.mail = action.payload.mail;
            state.phone = action.payload.phone;
            state.token = action.payload.token;
            state.refreshToken = action.payload.refreshToken ?? null;
            state.allowedCity = action.payload.allowedCity ?? null;
            state.allowedRoutes = null; // Will be set by setPermissions
            state.permissions = null;   // Will be set by setPermissions
            state.unauthorized = false;

            sessionStorage.setItem("auth", JSON.stringify(state));
        },

        logout: (state) => {
            state.userId = null;
            state.name = null;
            state.role = null;
            state.mail = null;
            state.phone = null;
            state.token = null;
            state.allowedCity = null;
            state.allowedRoutes = null;
            state.permissions = null;
            state.unauthorized = false;

            sessionStorage.removeItem("auth");
        },

        /**
         * Called ONCE after login with the full permission set from GET /permissions/all.
         * Automatically derives allowedRoutes (canRead === true) for the sidebar.
         */
        setPermissions: (state, action: PayloadAction<RoutePermission[]>) => {
            state.permissions = action.payload;

            // Derive allowedRoutes from permissions where canRead is true
            state.allowedRoutes = action.payload
                .filter((p) => p.canRead)
                .map((p) => ({
                    id: p.routeId,
                    name: p.routeName,
                    path: p.routePath,
                }));

            sessionStorage.setItem("auth", JSON.stringify(state));
        },

        /** Legacy — kept so existing code referencing setAllowedRoutes doesn't break */
        setAllowedRoutes: (state, action: PayloadAction<AuthRoute[]>) => {
            state.allowedRoutes = action.payload;
            sessionStorage.setItem("auth", JSON.stringify(state));
        },

        setUnauthorized: (state, action: PayloadAction<boolean>) => {
            state.unauthorized = action.payload;
            sessionStorage.setItem("auth", JSON.stringify(state));
        },

        clearUnauthorized: (state) => {
            state.unauthorized = false;
            sessionStorage.setItem("auth", JSON.stringify(state));
        },
    },
});

export const {
    login,
    logout,
    setPermissions,
    setAllowedRoutes,
    setUnauthorized,
    clearUnauthorized,
} = authSlice.actions;

export default authSlice.reducer;