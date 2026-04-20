'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * When the viewer switches away from the tab we nudge them back via the
 * document title and favicon. If they return after being gone for at least
 * `modalAfterMs`, we surface a one-shot marketing modal and report the
 * return through `onReturn`. The modal state is exposed so callers can render
 * their own overlay — this hook only manages timing and trace-side effects.
 */
export interface UseReEngagementOpts {
	/**
	 * Minimum time (ms) the viewer must be away for the modal to fire on return.
	 * Default 15000.
	 */
	modalAfterMs?: number;

	/**
	 * Called when the viewer returns AFTER any absence. Always fires, even below
	 * the modal threshold — lets you record it to the analytics trace.
	 */
	onReturn?: (info: { awayMs: number; modalShown: boolean }) => void;

	/**
	 * Titles to cycle through while the tab is hidden. Rotates every
	 * `titleCycleMs` (default 1500). The original title is restored on return.
	 */
	hiddenTitles?: string[];

	titleCycleMs?: number;

	/**
	 * Optional favicon URL to swap to while hidden. Reverted to original on
	 * return. Leave undefined to keep the original favicon untouched.
	 */
	hiddenFaviconUrl?: string;
}

export function useReEngagement(opts: UseReEngagementOpts = {}) {
	const {
		modalAfterMs = 15_000,
		onReturn,
		hiddenTitles = ['👀 Вернись!', '🔥 Не упусти!', '🏃 Ты куда?'],
		titleCycleMs = 1500,
		hiddenFaviconUrl,
	} = opts;

	const [modalOpen, setModalOpen] = useState(false);
	const firedModalRef = useRef(false);
	const hiddenAtRef = useRef<number | null>(null);
	const originalTitleRef = useRef<string | null>(null);
	const originalFaviconRef = useRef<string | null>(null);
	const titleIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

	// Keep the latest onReturn in a ref so the effect doesn't re-subscribe on
	// every render of the host component.
	const onReturnRef = useRef(onReturn);
	useEffect(() => {
		onReturnRef.current = onReturn;
	}, [onReturn]);

	useEffect(() => {
		if (typeof document === 'undefined') return;

		const getFaviconEl = (): HTMLLinkElement | null =>
			document.querySelector<HTMLLinkElement>("link[rel='icon']");

		function handleHidden() {
			hiddenAtRef.current = Date.now();

			if (originalTitleRef.current == null) {
				originalTitleRef.current = document.title;
			}
			if (hiddenFaviconUrl && originalFaviconRef.current == null) {
				const f = getFaviconEl();
				originalFaviconRef.current = f?.href ?? null;
			}

			// Cycle titles
			if (hiddenTitles.length > 0 && titleIntervalRef.current == null) {
				let i = 0;
				const tick = () => {
					document.title = hiddenTitles[i % hiddenTitles.length];
					i += 1;
				};
				tick();
				titleIntervalRef.current = setInterval(tick, titleCycleMs);
			}

			// Swap favicon
			if (hiddenFaviconUrl) {
				const f = getFaviconEl();
				if (f) f.href = hiddenFaviconUrl;
			}
		}

		function handleVisible() {
			if (titleIntervalRef.current) {
				clearInterval(titleIntervalRef.current);
				titleIntervalRef.current = null;
			}
			if (originalTitleRef.current != null) {
				document.title = originalTitleRef.current;
			}
			if (hiddenFaviconUrl && originalFaviconRef.current != null) {
				const f = getFaviconEl();
				if (f) f.href = originalFaviconRef.current;
			}

			const awayMs = hiddenAtRef.current != null ? Date.now() - hiddenAtRef.current : 0;
			hiddenAtRef.current = null;

			const shouldShowModal = awayMs >= modalAfterMs && !firedModalRef.current;
			if (shouldShowModal) {
				firedModalRef.current = true;
				setModalOpen(true);
			}
			if (awayMs > 0 && onReturnRef.current) {
				onReturnRef.current({ awayMs, modalShown: shouldShowModal });
			}
		}

		function onVisibilityChange() {
			if (document.visibilityState === 'hidden') handleHidden();
			else handleVisible();
		}

		document.addEventListener('visibilitychange', onVisibilityChange);
		return () => {
			document.removeEventListener('visibilitychange', onVisibilityChange);
			if (titleIntervalRef.current) {
				clearInterval(titleIntervalRef.current);
				titleIntervalRef.current = null;
			}
			if (originalTitleRef.current != null) {
				document.title = originalTitleRef.current;
			}
		};
	}, [modalAfterMs, hiddenTitles, titleCycleMs, hiddenFaviconUrl]);

	return {
		modalOpen,
		closeModal: () => setModalOpen(false),
	};
}
