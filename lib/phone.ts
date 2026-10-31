/** Normalises phone numbers so +234 801…, 234801… and 0801… are stored the same way (no duplicate customers). */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = raw.trim().replace(/[\s\-().]/g, "");
  if (!s) return null;
  if (s.startsWith("+234")) s = "0" + s.slice(4);
  else if (/^234\d{10}$/.test(s)) s = "0" + s.slice(3);
  return /^\+?\d{7,15}$/.test(s) ? s : null;
}
