import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { cx } from "../cx";
import type { Size } from "../shared/types";

export type FieldState = "default" | "error" | "success";

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  fieldSize?: Size;
  state?: FieldState;
  leading?: ReactNode;
  trailing?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { fieldSize = "md", state = "default", leading, trailing, className, ...rest },
  ref,
) {
  return (
    <div className={cx("s-input", `s-input--${fieldSize}`, state !== "default" && `is-${state}`, className)}>
      {leading && <span className="s-input__adorn" aria-hidden="true">{leading}</span>}
      <input ref={ref} aria-invalid={state === "error" || undefined} className="s-input__control" {...rest} />
      {trailing && <span className="s-input__adorn">{trailing}</span>}
    </div>
  );
});

export interface TextFieldProps extends InputProps {
  label: string;
  hideLabel?: boolean;
  hint?: ReactNode;
  error?: ReactNode;
  success?: ReactNode;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, hideLabel, hint, error, success, id, state, required, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? `tf${autoId}`;
  const msgId = `${inputId}-msg`;
  const resolved: FieldState = error ? "error" : success ? "success" : (state ?? "default");
  const message = error ?? success ?? hint;
  return (
    <div className="s-field">
      <label htmlFor={inputId} className={cx("s-field__label", hideLabel && "s-sr-only")}>
        {label}
        {required && <span aria-hidden="true" className="s-field__req"> *</span>}
      </label>
      <Input
        ref={ref}
        id={inputId}
        state={resolved}
        required={required}
        aria-describedby={message ? msgId : undefined}
        aria-errormessage={error ? msgId : undefined}
        {...rest}
      />
      {message && (
        <p id={msgId} className={cx("s-field__msg", resolved !== "default" && `is-${resolved}`)} role={error ? "alert" : undefined}>
          {resolved === "error" && <AlertCircle size={14} aria-hidden="true" />}
          {resolved === "success" && <CheckCircle2 size={14} aria-hidden="true" />}
          <span>{message}</span>
        </p>
      )}
    </div>
  );
});
