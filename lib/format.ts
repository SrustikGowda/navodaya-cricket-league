const IST = "Asia/Kolkata";

export function formatEventDates(startDate: string, endDate: string): string {
  const start = new Date(`${startDate}T00:00:00+05:30`);
  const end = new Date(`${endDate}T00:00:00+05:30`);
  const day = new Intl.DateTimeFormat("en-IN", { timeZone: IST, day: "numeric" });
  const monthYear = new Intl.DateTimeFormat("en-IN", { timeZone: IST, month: "long", year: "numeric" });
  if (startDate === endDate) {
    const full = new Intl.DateTimeFormat("en-IN", { timeZone: IST, day: "numeric", month: "long", year: "numeric" });
    return full.format(start);
  }
  if (startDate.slice(0, 7) === endDate.slice(0, 7)) {
    return `${day.format(start)}–${day.format(end)} ${monthYear.format(end)}`;
  }
  const full = new Intl.DateTimeFormat("en-IN", { timeZone: IST, day: "numeric", month: "long", year: "numeric" });
  return `${full.format(start)} – ${full.format(end)}`;
}

export function paymentDeadlineLabel(dueAt: string | null, fixtureDate: string | null): string {
  if (!dueAt) return "not set";
  const due = formatIst(dueAt);
  if (!fixtureDate) return due;
  const fixture = formatIst(`${fixtureDate}T00:00:00+05:30`, false);
  return `before the fixtures on ${fixture}, by ${due}`;
}

export function formatIst(iso: string | null, withTime = true): string {
  if (!iso) return "Time to be announced";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Time to be announced";
  const datePart = new Intl.DateTimeFormat("en-IN", {
    timeZone: IST,
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
  if (!withTime) return datePart;
  const timePart = new Intl.DateTimeFormat("en-IN", {
    timeZone: IST,
    hour: "numeric",
    minute: "2-digit",
    hourCycle: "h12",
  }).format(date);
  return `${datePart}, ${timePart} IST`;
}

export function istParts(iso: string): { date: string; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: IST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "00";
  return {
    date: `${read("year")}-${read("month")}-${read("day")}`,
    minutes: Number(read("hour")) * 60 + Number(read("minute")),
  };
}

export function istToIso(date: string, minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return new Date(
    `${date}T${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}:00+05:30`,
  ).toISOString();
}

export function parseIstInput(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(trimmed)) {
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})/);
  if (!match) return null;
  const parsed = new Date(`${match[1]}T${match[2]}:${match[3]}:00+05:30`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function formatInrFromPaise(paise: number): string {
  const rupees = paise / 100;
  const whole = Number.isInteger(rupees);
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  }).format(rupees);
}

export function minutesLabel(minutes: number | null): string {
  if (minutes == null) return "Not set";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")} IST`;
}

export function reportingIso(startsAt: string | null, minutesBefore: number | null): string | null {
  if (!startsAt || minutesBefore == null) return null;
  return new Date(new Date(startsAt).getTime() - minutesBefore * 60_000).toISOString();
}

export function slugify(input: string): string {
  const slug = input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || "team";
}

export function contactLine(role: string, name: string | null | undefined, phone: string | null | undefined): string | null {
  const mobile = formatIndianMobile(phone);
  const parts = [name?.trim(), mobile].filter(Boolean);
  if (parts.length === 0) return null;
  return `${role} ${parts.join(" · ")}`;
}

export function formatIndianMobile(value: string | null | undefined): string | null {
  const local = value ? normalizePhone(value) : null;
  if (!local) return null;
  return `${local.slice(0, 5)} ${local.slice(5)}`;
}

export function normalizePhone(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  const local =
    digits.length === 12 && digits.startsWith("91")
      ? digits.slice(2)
      : digits.length === 11 && digits.startsWith("0")
        ? digits.slice(1)
        : digits;
  return /^[6-9]\d{9}$/.test(local) ? local : null;
}

export function normalizeName(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, " ");
}

export function cricheroesPlayerId(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/cricheroes\.com\/player-profile\/(\d+)/i);
  return match?.[1] ?? null;
}

export function safeNextPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/captain";
  return value;
}

export function addCalendarStamp(date = new Date()): string {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

export function icsLocalStamp(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: IST,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "00";
  return `${read("year")}${read("month")}${read("day")}T${read("hour")}${read("minute")}${read("second")}`;
}
