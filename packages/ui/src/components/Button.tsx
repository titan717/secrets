import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cx } from "../cx";
import type { ButtonVariant, Size } from "../shared/types";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: Size;
  loading?: boolean;
  /** Accessible text announced while loading. */
  loadingLabel?: string;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "secondary",
    size = "md",
    loading = false,
    loadingLabel = "Loading",
    leadingIcon,
    trailingIcon,
    fullWidth,
    disabled,
    className,
    children,
    type = "button",
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx("s-btn", `s-btn--${variant}`, `s-btn--${size}`, fullWidth && "s-btn--full", loading && "is-loading", className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? (
        <Loader2 className="s-spin" size={16} aria-hidden="true" />
      ) : (
        leadingIcon && <span className="s-btn__icon" aria-hidden="true">{leadingIcon}</span>
      )}
      <span className="s-btn__label">{children}</span>
      {loading && <span className="s-sr-only">{loadingLabel}</span>}
      {!loading && trailingIcon && <span className="s-btn__icon" aria-hidden="true">{trailingIcon}</span>}
    </button>
  );
});

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  /** Required accessible name. */
  label: string;
  icon: ReactNode;
  variant?: ButtonVariant;
  size?: Size;
  /** Toggle buttons (mute, camera) expose aria-pressed. */
  pressed?: boolean;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, variant = "ghost", size = "md", pressed, className, type = "button", title, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={title ?? label}
      aria-pressed={pressed}
      className={cx("s-icon-btn", `s-btn--${variant}`, `s-icon-btn--${size}`, className)}
      {...rest}
    >
      <span aria-hidden="true" className="s-icon-btn__icon">{icon}</span>
    </button>
  );
});
