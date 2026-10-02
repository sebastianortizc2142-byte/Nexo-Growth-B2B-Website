type RateWindow = {
  count: number;
  resetAt: number;
};

const windows = new Map<string, RateWindow>();

export function allowRequest(
  key: string,
  limit: number,
  windowMs: number,
): boolean {
  const now = Date.now();
  const current = windows.get(key);

  if (!current || current.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    pruneWindows(now);
    return true;
  }

  if (current.count >= limit) {
    return false;
  }

  current.count += 1;
  return true;
}

function pruneWindows(now: number): void {
  if (windows.size < 10_000) {
    return;
  }

  for (const [key, value] of windows) {
    if (value.resetAt <= now) {
      windows.delete(key);
    }
  }
}