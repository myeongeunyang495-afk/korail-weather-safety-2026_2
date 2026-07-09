/** 표시용 포매팅 유틸 */

const pad = (n: number) => String(n).padStart(2, "0");

/** "06월 26일 10:11 조회" */
export function formatObservedAt(d: Date): string {
  return `${pad(d.getMonth() + 1)}월 ${pad(d.getDate())}일 ${pad(d.getHours())}:${pad(d.getMinutes())} 조회`;
}

/** "2026-06-26 10:11" (기록일지/CSV용) */
export function formatTimestamp(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "24.3°C" */
export function formatTemp(c: number): string {
  return `${c.toFixed(1)}°C`;
}

/** "14시" */
export function formatHourLabel(d: Date): string {
  return `${d.getHours()}시`;
}
