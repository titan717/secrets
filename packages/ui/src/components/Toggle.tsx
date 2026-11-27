import { useId, useState, type ReactNode } from "react";
import { cx } from "../cx";

export interface ToggleProps {
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  className?: string;
  id?: string;
}

/** Switch (role="switch"). Use for settings that apply immediately. */
export function Toggle({ checked, defaultChecked = false, onChange, label, description, disabled, className, id }: ToggleProps) {
  const [inner, setInner] = useState(defaultChecked);
  const on = checked ?? inner;
  const auto = useId();
  const btnId = id ?? `tg${auto}`;
  const descId = description ? `${btnId}-desc` : undefined;
  const flip = () => {
    if (checked === undefined) setInner(!on);
    onChange?.(!on);
  };
  return (
    <div className={cx("s-toggle", disabled && "is-disabled", className)}>
      <span className="s-toggle__text">
        <label htmlFor={btnId} className="s-toggle__label">{label}</label>
        {description && <span id={descId} className="s-toggle__desc">{description}</span>}
      </span>
      <button
        id={btnId}
        type="button"
        role="switch"
        aria-checked={on}
        aria-describedby={descId}
        disabled={disabled}
        onClick={flip}
        className={cx("s-switch", on && "is-on")}
      >
        <span className="s-switch__thumb" aria-hidden="true" />
      </button>
    </div>
  );
}
