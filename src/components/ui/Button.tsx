import { clsx } from "clsx";
import Link from "next/link";
import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost";

const variantClasses: Record<Variant, string> = {
  primary: "bg-brand-500 text-white hover:bg-brand-600",
  secondary: "bg-neutral-100 text-neutral-900 hover:bg-neutral-200",
  ghost: "bg-transparent text-neutral-900 hover:bg-neutral-100",
};

const baseClasses =
  "inline-flex items-center justify-center rounded-md px-5 py-3 text-sm font-medium " +
  "transition-colors focus-visible:outline focus-visible:outline-2 " +
  "focus-visible:outline-offset-2 focus-visible:outline-brand-500 " +
  "disabled:cursor-not-allowed disabled:opacity-50";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      className={clsx(baseClasses, variantClasses[variant], className)}
      {...props}
    />
  );
}

interface LinkButtonProps {
  href: string;
  variant?: Variant;
  className?: string;
  children: React.ReactNode;
}

export function LinkButton({
  href,
  variant = "primary",
  className,
  children,
}: LinkButtonProps) {
  return (
    <Link
      href={href}
      className={clsx(baseClasses, variantClasses[variant], className)}
    >
      {children}
    </Link>
  );
}
