// Adaptive polling helpers.
//
// The mail list used to poll /email/latest on a fixed `autoRefresh` interval
// (floor 3s) regardless of whether the tab was visible or anything was arriving.
// One open tab at 3s burns ~28.8k requests/day, which alone blows through the
// Cloudflare Workers free-plan budget of 100k requests/day.
//
// Two rules fix that without changing the UX when mail is actually flowing:
//   1. A hidden tab does not poll at all - it parks until it becomes visible.
//   2. Consecutive empty polls back off exponentially up to MAX_DELAY_MS, and
//      any new mail (or the tab regaining focus) resets to the base interval.

export const MIN_DELAY_MS = 3000;
export const MAX_DELAY_MS = 5 * 60 * 1000;
const BACKOFF_FACTOR = 1.6;

/**
 * Delay before the next poll.
 * @param {number} baseSeconds  the admin-configured autoRefresh value, in seconds
 * @param {number} emptyStreak  how many consecutive polls returned nothing
 */
export function pollDelay(baseSeconds, emptyStreak = 0) {
	const base = Math.max(Number(baseSeconds) > 1 ? Number(baseSeconds) * 1000 : MIN_DELAY_MS, MIN_DELAY_MS);
	const scaled = base * Math.pow(BACKOFF_FACTOR, Math.max(0, emptyStreak));
	return Math.min(Math.round(scaled), MAX_DELAY_MS);
}

/** True when the document is currently visible (always true outside a browser). */
export function isVisible() {
	return typeof document === 'undefined' || document.visibilityState === 'visible';
}

/** Resolves as soon as the document is visible; resolves immediately if it already is. */
export function whenVisible() {
	if (isVisible()) {
		return Promise.resolve();
	}
	return new Promise(resolve => {
		const onChange = () => {
			if (isVisible()) {
				document.removeEventListener('visibilitychange', onChange);
				resolve();
			}
		};
		document.addEventListener('visibilitychange', onChange);
	});
}
