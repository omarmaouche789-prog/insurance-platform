import { forwardRef, useId } from "react";
import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "./cn";

export const controlClass =
  "block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 transition-colors focus:border-primary-navy focus:outline-none focus:ring-2 focus:ring-primary-navy/30 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500";

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
  required,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
  htmlFor?: string;
  required?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-gray-700">
        {label}
        {required && <span className="ml-0.5 text-red-600" aria-hidden>*</span>}
      </label>
      {children}
      {error ? (
        <p className="mt-1.5 text-xs text-red-600" role="alert">
          {error}
        </p>
      ) : (
        hint && <p className="mt-1.5 text-xs text-gray-500">{hint}</p>
      )}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(function Input(
  { className, invalid, ...rest },
  ref,
) {
  return <input ref={ref} aria-invalid={invalid || undefined} className={cn(controlClass, invalid && "border-red-500", className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, ...rest },
  ref,
) {
  return <textarea ref={ref} className={cn(controlClass, "min-h-[88px] resize-y", className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, ...rest }, ref) {
  return <select ref={ref} className={cn(controlClass, "pr-8", className)} {...rest} />;
});

export function Checkbox({ label, className, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label?: ReactNode }) {
  const id = useId();
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <input
        id={rest.id ?? id}
        type="checkbox"
        className="h-4 w-4 rounded border-gray-300 text-primary-navy accent-primary-navy focus:ring-primary-navy"
        {...rest}
      />
      {label && (
        <label htmlFor={rest.id ?? id} className="text-sm text-gray-700">
          {label}
        </label>
      )}
    </span>
  );
}

// Character counter for length-limited fields (SEO metadata, reasons).
export function CharCount({ value, max }: { value: string; max: number }) {
  const over = value.length > max;
  return (
    <span className={cn("text-xs tabular-nums", over ? "text-red-600" : value.length > max * 0.9 ? "text-amber-700" : "text-gray-400")}>
      {value.length}/{max}
    </span>
  );
}
