/** Local-date helpers (YYYY-MM-DD in the user's timezone). */
export function ymd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export const todayYmd = () => ymd(new Date());
export function addDaysYmd(base: string, n: number): string {
  const [y, m, d] = base.split("-").map(Number);
  return ymd(new Date(y, m - 1, d + n));
}
export function parseYmd(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** "Today", "Tomorrow", "Yesterday", weekday within a week, else "Apr 25". */
export function dueLabel(date: string | null, time?: string | null): string {
  if (!date) return "";
  const today = todayYmd();
  const diff = Math.round((parseYmd(date).getTime() - parseYmd(today).getTime()) / 86400000);
  let s: string;
  if (diff === 0) s = "Today";
  else if (diff === 1) s = "Tomorrow";
  else if (diff === -1) s = "Yesterday";
  else if (diff > 1 && diff < 7) s = parseYmd(date).toLocaleDateString([], { weekday: "long" });
  else s = parseYmd(date).toLocaleDateString([], { month: "short", day: "numeric", year: parseYmd(date).getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
  if (time) {
    const [h, m] = time.split(":").map(Number);
    s += ` · ${new Date(2000, 0, 1, h, m).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
  }
  return s;
}

export const isOverdue = (date: string | null) => !!date && date < todayYmd();

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const WD_SHORT = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export interface QuickParse {
  title: string;
  due_date: string | null;
  due_time: string | null;
  priority: "high" | "normal" | "low" | null;
}

/**
 * Parse a quick-add line like "Call mom tomorrow 6pm !high".
 * Dates: today, tonight, tomorrow/tmrw, weekday names ("fri", "next monday"), "next week", "in 3 days".
 * Times: 6pm, 6:30pm, 18:30, "at 9". Priority: !high/!h/!!, !low/!l, !normal.
 */
export function parseQuickAdd(input: string): QuickParse {
  let s = ` ${input} `;
  let due_date: string | null = null;
  let due_time: string | null = null;
  let priority: QuickParse["priority"] = null;
  const today = todayYmd();
  const take = (re: RegExp, fn: (m: RegExpMatchArray) => void) => {
    const m = s.match(re);
    if (m) {
      fn(m);
      s = s.replace(m[0], " ");
    }
  };
  take(/\s(!high|!h|!urgent|!!)(?=\s)/i, () => (priority = "high"));
  take(/\s(!low|!l)(?=\s)/i, () => (priority = "low"));
  take(/\s(!normal|!medium|!med)(?=\s)/i, () => (priority = "normal"));
  take(/\s(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)(?=\s)/i, (m) => {
    let h = Number(m[1]) % 12;
    if (m[3].toLowerCase() === "pm") h += 12;
    due_time = `${String(h).padStart(2, "0")}:${m[2] ?? "00"}`;
  });
  if (!due_time)
    take(/\s(?:at\s+)?([01]?\d|2[0-3]):([0-5]\d)(?=\s)/, (m) => {
      due_time = `${m[1].padStart(2, "0")}:${m[2]}`;
    });
  take(/\s(today|tonight)(?=\s)/i, (m) => {
    due_date = today;
    if (m[1].toLowerCase() === "tonight" && !due_time) due_time = "20:00";
  });
  take(/\s(tomorrow|tmrw|tmr)(?=\s)/i, () => (due_date = addDaysYmd(today, 1)));
  take(/\snext\s+week(?=\s)/i, () => (due_date = addDaysYmd(today, 7)));
  take(/\sin\s+(\d{1,2})\s+days?(?=\s)/i, (m) => (due_date = addDaysYmd(today, Number(m[1]))));
  take(new RegExp(`\\s(?:(next|on)\\s+)?(${[...WEEKDAYS, ...WD_SHORT].join("|")})(?=\\s)`, "i"), (m) => {
    const word = m[2].toLowerCase();
    const target = WEEKDAYS.indexOf(word) >= 0 ? WEEKDAYS.indexOf(word) : WD_SHORT.indexOf(word);
    const now = new Date().getDay();
    let diff = (target - now + 7) % 7;
    if (diff === 0) diff = 7;
    if (m[1]?.toLowerCase() === "next" && diff < 7) diff += 0;
    due_date = addDaysYmd(today, diff);
  });
  if (due_time && !due_date) due_date = today;
  return { title: s.replace(/\s+/g, " ").trim(), due_date, due_time, priority };
}
