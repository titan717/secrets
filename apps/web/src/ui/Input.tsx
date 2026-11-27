import { forwardRef, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: ReactNode;
  error?: string | null;
  leading?: ReactNode;
  trailing?: ReactNode;
  variant?: "box" | "line";
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, leading, trailing, variant = "box", className = "", id, ...rest },
  ref,
) {
  const inputId = id ?? (label ? `in-${label.replace(/\s+/g, "-").toLowerCase()}` : undefined);
  return (
    <div className={`field ${className}`}>
      {label && (
        <label className="field-label" htmlFor={inputId}>
          {label}
        </label>
      )}
      <div className={`input-wrap input-${variant} ${error ? "has-error" : ""}`}>
        {leading && <span className="input-adorn">{leading}</span>}
        <input ref={ref} id={inputId} className="input" aria-invalid={!!error || undefined} {...rest} />
        {trailing && <span className="input-adorn">{trailing}</span>}
      </div>
      {error ? <div className="field-error" role="alert">{error}</div> : hint ? <div className="field-hint">{hint}</div> : null}
    </div>
  );
});

export interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  hint?: ReactNode;
}
export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea({ label, hint, className = "", id, ...rest }, ref) {
  const inputId = id ?? (label ? `ta-${label.replace(/\s+/g, "-").toLowerCase()}` : undefined);
  return (
    <div className={`field ${className}`}>
      {label && (
        <label className="field-label" htmlFor={inputId}>
          {label}
        </label>
      )}
      <div className="input-wrap input-box">
        <textarea ref={ref} id={inputId} className="input textarea" {...rest} />
      </div>
      {hint && <div className="field-hint">{hint}</div>}
    </div>
  );
});
