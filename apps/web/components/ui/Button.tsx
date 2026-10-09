import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { cn } from "./cn";

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost" | "accent";
type Size = "sm" | "md";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-primary-navy text-white hover:bg-opacity-90 shadow-sm",
  accent: "bg-primary-orange text-gray-900 hover:bg-opacity-90 shadow-sm",
  secondary: "border border-gray-300 bg-white text-gray-800 hover:bg-gray-50 shadow-sm",
  danger: "bg-red-600 text-onaccent hover:bg-red-500 shadow-sm",
  ghost: "text-gray-700 hover:bg-gray-100",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 gap-1.5 px-3 text-xs",
  md: "h-9 gap-2 px-4 text-sm",
};

export function buttonClasses(variant: ButtonVariant = "secondary", size: Size = "md", className?: string): string {
  return cn(
    "inline-flex shrink-0 items-center justify-center rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
    VARIANTS[variant],
    SIZES[size],
    className,
  );
}

// A link that looks like a button (never a <button> inside an <a>).
export function ButtonLink({
  href,
  variant,
  size,
  icon,
  className,
  children,
}: {
  href: string;
  variant?: ButtonVariant;
  size?: Size;
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={buttonClasses(variant, size, className)}>
      {icon}
      {children}
    </Link>
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", loading = false, icon, className, children, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClasses(variant, size, className)}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});

export function IconButton({
  label,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 disabled:opacity-50",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
