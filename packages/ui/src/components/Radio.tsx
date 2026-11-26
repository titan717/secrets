import { createContext, useContext, useId, useState, type ReactNode } from "react";
import { cx } from "../cx";

interface RadioCtx {
  name: string;
  value: string | undefined;
  set: (v: string) => void;
  disabled?: boolean;
}
const Ctx = createContext<RadioCtx | null>(null);

export interface RadioGroupProps {
  label: ReactNode;
  hideLabel?: boolean;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  name?: string;
  disabled?: boolean;
  children: ReactNode;
  className?: string;
}

/** Native radio inputs in a fieldset: arrow-key navigation comes for free. */
export function RadioGroup({ label, hideLabel, value, defaultValue, onChange, name, disabled, children, className }: RadioGroupProps) {
  const [inner, setInner] = useState(defaultValue);
  const auto = useId();
  const current = value ?? inner;
  const set = (v: string) => {
    if (value === undefined) setInner(v);
    onChange?.(v);
  };
  return (
    <fieldset className={cx("s-radio-group", className)} disabled={disabled}>
      <legend className={cx("s-field__label", hideLabel && "s-sr-only")}>{label}</legend>
      <Ctx.Provider value={{ name: name ?? `rg${auto}`, value: current, set, disabled }}>{children}</Ctx.Provider>
    </fieldset>
  );
}

export interface RadioProps {
  value: string;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}

export function Radio({ value, label, description, disabled }: RadioProps) {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("<Radio> must be used inside <RadioGroup>");
  const id = useId();
  return (
    <div className="s-radio">
      <input
        id={id}
        type="radio"
        className="s-radio__input"
        name={ctx.name}
        value={value}
        checked={ctx.value === value}
        disabled={disabled}
        onChange={() => ctx.set(value)}
        aria-describedby={description ? `${id}-d` : undefined}
      />
      <label htmlFor={id} className="s-radio__label">
        <span>{label}</span>
        {description && <span id={`${id}-d`} className="s-toggle__desc">{description}</span>}
      </label>
    </div>
  );
}
