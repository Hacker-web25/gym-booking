// Today's date in India (IST) as YYYY-MM-DD, whatever the browser's own time zone is.
export function todayIst(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}
