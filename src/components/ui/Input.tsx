import { clsx } from "clsx";
import type { InputHTMLAttributes } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

export function Input({ label, id, className, ...props }: InputProps) {
  const inputId = id ?? props.name;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium text-neutral-700">
        {label}
      </label>
      <input
        id={inputId}
        className={clsx(
          "rounded-md border border-neutral-300 px-3 py-2 text-sm",
          "focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500",
          className,
        )}
        {...props}
      />
    </div>
  );
}
