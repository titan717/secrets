import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  children: ReactNode;
  size?: "sm" | "md" | "lg";
  variant?: "ghost" | "soft" | "accent" | "danger";
  active?: boolean;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, children, size = "md", variant = "ghost", active, className = "", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      aria-label={label}
      title={label}
      className={`icon-btn icon-btn-${size} icon-btn-${variant} ${active ? "is-active" : ""} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
});
