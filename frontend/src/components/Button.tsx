import clsx from "clsx";
import { forwardRef, type ButtonHTMLAttributes } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, loading = false, disabled, type = "button", children, ...props }, ref) => {
        const isDisabled = disabled || loading;

        return (
            <button
                ref={ref}
                type={type}
                disabled={isDisabled}
                aria-busy={loading}
                className={clsx(
                    "inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-medium transition-colors",
                    "bg-blue-500 text-white hover:bg-blue-600 outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2",
                    "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-blue-500",
                    className
                )}
                {...props}
            >
                {loading && (
                    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className="size-4 animate-spin">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
                        <path fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" className="opacity-75" />
                    </svg>
                )}
                {children}
            </button>
        );
    }
);

Button.displayName = "Button";
