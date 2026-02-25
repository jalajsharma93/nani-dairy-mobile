export function todayLocalISO(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function shiftIsoDate(dateIso: string, deltaDays: number): string {
  const date = new Date(`${dateIso}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return dateIso;
  }
  date.setDate(date.getDate() + deltaDays);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function shortWeekLabel(dateIso: string): string {
  const date = new Date(`${dateIso}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return dateIso.slice(5);
  }
  return date.toLocaleDateString(undefined, { weekday: "short" });
}
