import { colorVarName, spaceVarName } from "./css";
import { fontSize, radius, space, duration, size } from "./scale";
import { themeColors, type ThemeColors } from "./themes";
import { kebab } from "./css";

type VarMap<T> = { readonly [K in keyof T]: string };

const sample = themeColors("dark");

/** `var(--color-…)` references, for CSS-in-TS and inline styles on web. */
export const vars = {
  color: Object.fromEntries(Object.keys(sample).map((k) => [k, `var(${colorVarName(k)})`])) as VarMap<ThemeColors>,
  space: Object.fromEntries(Object.keys(space).map((k) => [k, `var(${spaceVarName(k)})`])) as VarMap<typeof space>,
  radius: Object.fromEntries(Object.keys(radius).map((k) => [k, `var(--radius-${k})`])) as VarMap<typeof radius>,
  fontSize: Object.fromEntries(Object.keys(fontSize).map((k) => [k, `var(--font-size-${k})`])) as VarMap<typeof fontSize>,
  lineHeight: Object.fromEntries(Object.keys(fontSize).map((k) => [k, `var(--line-height-${k})`])) as VarMap<typeof fontSize>,
  duration: Object.fromEntries(Object.keys(duration).map((k) => [k, `var(--duration-${k})`])) as VarMap<typeof duration>,
  size: Object.fromEntries(Object.keys(size).map((k) => [k, `var(--size-${kebab(k)})`])) as VarMap<typeof size>,
  shadow: { 0: "var(--shadow-0)", 1: "var(--shadow-1)", 2: "var(--shadow-2)", 3: "var(--shadow-3)" },
} as const;
