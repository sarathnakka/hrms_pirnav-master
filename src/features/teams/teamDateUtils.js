import { DAY_ORDER } from './teamMappers';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function startOfWeek(value = new Date()) {
  const date = new Date(value.getFullYear(), value.getMonth(), value.getDate());
  const mondayOffset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - mondayOffset);
  return date;
}

export function addDays(value, amount) {
  const date = new Date(value.getFullYear(), value.getMonth(), value.getDate());
  date.setDate(date.getDate() + amount);
  return date;
}

export function addWeeks(value, amount) {
  return addDays(value, amount * 7);
}

export function toDateOnly(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

export function fromDateOnly(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''));
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

export function formatWeekRange(weekStart) {
  const end = addDays(weekStart, 6);
  const startLabel = `${weekStart.getDate()} ${MONTHS[weekStart.getMonth()]}`;
  const endLabel = `${end.getDate()} ${MONTHS[end.getMonth()]}`;
  return `${startLabel} - ${endLabel} ${end.getFullYear()}`;
}

export function formatRequestDate(value, fallback = 'Date not specified') {
  const localDate = fromDateOnly(value);
  const date = localDate || (value ? new Date(value) : null);
  if (!date || Number.isNaN(date.getTime())) return fallback;
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

export function scheduleDays(days, weekStart) {
  const selected = new Set(Array.isArray(days) ? days : []);
  return DAY_ORDER
    .map((day, index) => ({ day, date: addDays(weekStart, index) }))
    .filter((item) => selected.has(item.day));
}

export function sameDate(left, right) {
  return toDateOnly(left) === toDateOnly(right);
}

