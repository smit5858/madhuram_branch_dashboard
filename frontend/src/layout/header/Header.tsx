import { useLocation } from "react-router-dom";

const getTitleFromPath = (pathname: string) => {
    const segment = pathname.split("/").filter(Boolean)[0] ?? "";
    if (!segment) return "Dashboard";

    return segment
        .split("-")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
};

const nounForSubtitle = (title: string) => {
    if (title === "Dashboard") return "Overview of your branch";
    return `Manage all ${title.toLowerCase()}`;
};

const Header = () => {
    const { pathname } = useLocation();
    const title = getTitleFromPath(pathname);

    return (
        <div className="header w-full bg-white px-6 py-4 border-b border-slate-100">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-bold text-slate-800 tracking-tight">{title}</h2>
                    <p className="text-xs text-slate-500 mt-0.5">{nounForSubtitle(title)}</p>
                </div>
            </div>
        </div>
    )
}

export default Header
