import { format } from "date-fns";
import { tz } from "@date-fns/tz";

// Dates are stored in UTC; display them in the restaurant's configured timezone.
export function formatInZone(
  date: Date | string | number,
  timeZone: string,
  pattern = "d MMM yyyy, h:mm a",
) {
  return format(date, pattern, { in: tz(timeZone) });
}
