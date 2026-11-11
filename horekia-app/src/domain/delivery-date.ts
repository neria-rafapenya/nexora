export function localDateISO(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function minimumDeliveryDate(now = new Date()) {
  return localDateISO(
    new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1),
  );
}
export function validDeliveryDate(value: string, now = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T12:00:00");
  return (
    !Number.isNaN(date.valueOf()) &&
    localDateISO(date) === value &&
    value >= minimumDeliveryDate(now)
  );
}
