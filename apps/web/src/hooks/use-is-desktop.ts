import { useSyncExternalStore } from 'react';

// Subscribe to the md: breakpoint via matchMedia. Returns false during SSR
// and on first client render, then flips to the real value on hydration —
// acceptable because the caller uses it to relax mobile-only behavior, not
// to decide what to render on the server.
export function useIsDesktop(): boolean {
	return useSyncExternalStore(
		subscribeDesktop,
		getDesktopSnapshot,
		getDesktopServerSnapshot,
	);
}

function subscribeDesktop(callback: () => void): () => void {
	if (typeof window === 'undefined' || !window.matchMedia) return () => {};
	const mq = window.matchMedia('(min-width: 768px)');
	mq.addEventListener('change', callback);
	return () => mq.removeEventListener('change', callback);
}

function getDesktopSnapshot(): boolean {
	if (typeof window === 'undefined' || !window.matchMedia) return false;
	return window.matchMedia('(min-width: 768px)').matches;
}

function getDesktopServerSnapshot(): boolean {
	return false;
}
