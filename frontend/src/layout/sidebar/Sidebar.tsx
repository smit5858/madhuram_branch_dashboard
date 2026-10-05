import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import clsx from "clsx";
import { ChevronLeft, ChevronRight, Package, ShoppingCart, Building2, Users, type LucideIcon } from "lucide-react";
import LOGO from "@/assets/logo.jpg";
import type { RootState } from "../../store/store";
import { useSelector, useDispatch } from "react-redux";
import { logout } from "../../store/slices/authSlice";
import { useNavigate } from "react-router-dom";
import { LogOut } from "lucide-react";

interface SidebarItem {
    path: string;
    name: string;
    icon: LucideIcon;
    /** If set, only these roles (case-insensitive) can see the item */
    roles?: string[];
}

const ALL_SIDEBAR_ITEMS: SidebarItem[] = [
    { path: "/products", name: "Products", icon: Package },
    { path: "/sales", name: "Sales", icon: ShoppingCart },
    { path: "/branch", name: "Branches", icon: Building2, roles: ["admin"] },
    { path: "/employee", name: "Employees", icon: Users, roles: ["admin"] },
];

const SIDEBAR_COLLAPSED_STORAGE_KEY = "sidebar:collapsed";


const Sidebar = () => {
    const navigate = useNavigate();
    // const location = useLocation();
    const dispatch = useDispatch();
    const [collapsed, setCollapsed] = useState<boolean>(() => {
        try {
            return window.sessionStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "1";
        } catch {
            return false;
        }
    });

    const { name, role } = useSelector((state: RootState) => state.auth);

    const sidebarItems = ALL_SIDEBAR_ITEMS.filter(
        (item) => !item.roles || item.roles.includes((role ?? "").toLowerCase())
    );

    useEffect(() => {
        try {
            window.sessionStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, collapsed ? "1" : "0");
        } catch {
            // Ignore storage failures (e.g. private browsing) — collapse still works for the session.
        }
    }, [collapsed]);

    const handleLogout = () => {
        dispatch(logout());
        navigate("/");
    };

    return (
        <div
            className={clsx(
                "relative flex h-screen flex-col border-r border-[#e0e0e0] bg-[#1e293b] text-slate-300 transition-[width] duration-200 ease-in-out",
                collapsed ? "w-20" : "w-75"
            )}
        >
            <button
                type="button"
                onClick={() => setCollapsed((prev) => !prev)}
                title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                className="absolute -right-3 top-8 z-20 flex h-6 w-6 items-center justify-center rounded-full border border-slate-600 bg-slate-800 text-slate-300 shadow-md transition-colors hover:bg-slate-700 hover:text-white"
            >
                {collapsed ? <ChevronRight className="h-3.5 w-3.5" strokeWidth={1.8} /> : <ChevronLeft className="h-3.5 w-3.5" strokeWidth={1.8} />}
            </button>

            <div
                className={clsx(
                    "flex items-center border-b border-slate-700 py-5 shrink-0 transition-all duration-200",
                    collapsed ? "justify-center gap-0 px-2" : "gap-3 px-6"
                )}
            >
                <img
                    src={LOGO}
                    alt="Madhuram Motors Logo"
                    className="h-10 w-10 shrink-0 rounded-full object-cover border-2 border-blue-500"
                />
                <div className={clsx("overflow-hidden whitespace-nowrap transition-all duration-200", collapsed ? "max-w-0 opacity-0" : "max-w-40 opacity-100")}>
                    <h2 className="text-base font-bold text-white tracking-wide">
                        Madhuram Motors
                    </h2>
                    <span className="text-xs text-blue-400 font-medium uppercase tracking-wider">
                        CRM Dashboard
                    </span>
                </div>
            </div>

            <nav className="flex-1 min-h-0 overflow-y-auto mt-6 px-4 pb-4 space-y-1.5">
                {sidebarItems.map((item) => (
                    <NavLink
                        key={item.path}
                        to={item.path}
                        title={collapsed ? item.name : undefined}
                        className={({ isActive }) =>
                            clsx(
                                "flex items-center gap-3 rounded-lg py-2 text-sm font-medium transition-colors",
                                collapsed ? "justify-center px-0" : "px-4",
                                isActive
                                    ? "bg-blue-500 text-white shadow-sm"
                                    : "text-slate-300 hover:bg-slate-700 hover:text-white"
                            )
                        }
                    >
                        <item.icon className="h-5 w-5 shrink-0" />
                        <span className={collapsed ? "hidden" : "block"}>{item.name}</span>
                    </NavLink>
                ))}
            </nav>

            <div className={`border-t border-slate-700 shrink-0 transition-all duration-200 ${collapsed ? "p-2" : "p-4"}`}>
                <div className={`flex items-center rounded-lg bg-slate-800/60 transition-all duration-200 ${collapsed ? "flex-col gap-2 p-2" : "justify-between p-3"}`}>
                    {!collapsed && (
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-white">
                                {name || "Loading User..."}
                            </p>
                            <p className="text-xs text-blue-400 font-medium capitalize">
                                Role: {role || "Staff"}
                            </p>
                        </div>
                    )}

                    <button
                        onClick={handleLogout}
                        title="Logout"
                        className={`rounded-md p-1.5 text-slate-400 hover:bg-slate-700 hover:text-white transition-colors ${collapsed ? "" : "ml-3"}`}
                    >
                        <LogOut className="h-5 w-5" strokeWidth={1.5} />
                    </button>
                </div>
            </div>

        </div>
    )
}

export default Sidebar
