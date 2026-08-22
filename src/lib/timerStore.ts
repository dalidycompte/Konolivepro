/**
 * Persistent processing-timer store.
 * Survives React component unmount/remount (SPA navigation).
 * Also uses localStorage so it survives a page refresh.
 */

const LS_KEY = 'konolive_proc_timers';

// Module-level map: requestId → epoch ms when processing started
const _map = new Map<string, number>();

// Hydrate from localStorage on first import
function _load() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return;
    const parsed: Record<string, number> = JSON.parse(raw);
    for (const [id, ts] of Object.entries(parsed)) {
      if (typeof ts === 'number') _map.set(id, ts);
    }
  } catch { /* ignore */ }
}

function _save() {
  try {
    const obj: Record<string, number> = {};
    _map.forEach((ts, id) => { obj[id] = ts; });
    localStorage.setItem(LS_KEY, JSON.stringify(obj));
  } catch { /* ignore */ }
}

_load();

/** Start timing for a request (no-op if already started). */
export function startTimer(requestId: string): void {
  if (_map.has(requestId)) return;
  _map.set(requestId, Date.now());
  _save();
}

/**
 * Returns elapsed seconds since the timer started.
 * Returns 0 if the timer was never started.
 */
export function getElapsedSeconds(requestId: string): number {
  const ts = _map.get(requestId);
  if (!ts) return 0;
  return Math.floor((Date.now() - ts) / 1000);
}

/** Call when processing is complete (decision made). */
export function clearTimer(requestId: string): void {
  _map.delete(requestId);
  _save();
}
