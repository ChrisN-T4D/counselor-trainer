export function formatHours(seconds: number) {
  const hours = seconds / 3600;
  return hours < 0.1 ? "< 0.1 hr" : `${hours.toFixed(1)} hr`;
}

export function formatDuration(seconds: number) {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder > 0 ? `${minutes}m ${remainder}s` : `${minutes}m`;
}

export function formatDateTime(value: Date | string | null | undefined) {
  if (!value) {
    return "—";
  }
  return new Date(value).toLocaleString();
}
