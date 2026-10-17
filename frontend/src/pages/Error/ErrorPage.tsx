import { useSelector } from "react-redux";
import { isRouteErrorResponse, useNavigate, useRouteError } from "react-router-dom";
import { ArrowLeft, Home, RotateCw } from "lucide-react";
import { Button } from "@/components/Button";
import { useDocumentTitle } from "@/hook/useDocumentTitle";
import type { RootState } from "@/store/store";
import LOGO from "@/assets/logo.jpg";

/** Router error boundary — renders a 404 for unmatched routes and a generic error screen for anything thrown while rendering */
const ErrorPage = () => {
    const error = useRouteError();
    const navigate = useNavigate();
    const token = useSelector((state: RootState) => state.auth.token);

    const isNotFound = isRouteErrorResponse(error) && error.status === 404;
    const status = isRouteErrorResponse(error) ? error.status : 500;
    const title = isNotFound ? "Page not found" : "Something went wrong";
    const message = isNotFound
        ? "The page you are looking for doesn't exist or has been moved."
        : "An unexpected error occurred. Try reloading the page, or head back home.";
    const details = isRouteErrorResponse(error)
        ? error.statusText || (typeof error.data === "string" ? error.data : "")
        : error instanceof Error ? error.message : "";

    useDocumentTitle(isNotFound ? "404" : "Error");

    if (!isNotFound) console.error(error);

    return (
        <div className="relative grid min-h-screen place-items-center overflow-hidden bg-slate-900 p-6 text-white">
            <div className="pointer-events-none absolute -right-32 -top-32 size-96 rounded-full bg-blue-500/20 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-40 -left-20 size-96 rounded-full bg-blue-500/10 blur-3xl" />

            <div className="relative w-full max-w-md space-y-8 text-center">
                <div className="flex items-center justify-center gap-3">
                    <div className="h-10 w-10 overflow-hidden rounded-xl">
                        <img src={LOGO} alt="Madhuram Motors Logo" className="h-full w-full object-cover" />
                    </div>
                    <div className="text-left leading-tight">
                        <p className="text-base font-semibold">Madhuram Motors</p>
                        <p className="text-xs opacity-60">Branch Dashboard</p>
                    </div>
                </div>

                <div className="space-y-3">
                    <p className="text-7xl font-bold tracking-tight text-blue-400">{status}</p>
                    <h1 className="text-2xl font-semibold">{title}</h1>
                    <p className="text-slate-400">{message}</p>
                    {!isNotFound && details && (
                        <pre className="mt-4 max-h-32 overflow-auto rounded-xl bg-white/5 p-3 text-left text-xs text-slate-400 whitespace-pre-wrap break-words">
                            {details}
                        </pre>
                    )}
                </div>

                <div className="flex flex-col gap-3 sm:flex-row">
                    <Button
                        className="bg-white/10 hover:bg-white/20 disabled:hover:bg-white/10"
                        onClick={() => (isNotFound ? navigate(-1) : window.location.reload())}
                    >
                        {isNotFound ? <ArrowLeft className="size-4" /> : <RotateCw className="size-4" />}
                        {isNotFound ? "Go back" : "Reload"}
                    </Button>
                    <Button onClick={() => navigate(token ? "/sales" : "/login", { replace: true })}>
                        <Home className="size-4" />
                        {token ? "Go to dashboard" : "Go to login"}
                    </Button>
                </div>
            </div>
        </div>
    );
};

export default ErrorPage;
