'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * When the viewer switches away from the tab we nudge them back via the
 * document title and favicon. The favicon cycles in sync with the title,
 * using the leading emoji of each title string. The modal state is exposed
 * for callers but can be ignored — this hook only manages timing + side
 * effects and reports returns through `onReturn`.
 */
export interface UseReEngagementOpts {
	/**
	 * Minimum time (ms) the viewer must be away for `modalOpen` to flip true on
	 * return. Default 15000. Callers can ignore `modalOpen` if they don't want
	 * to render a modal.
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
	 * The leading emoji of each title is also used as the favicon for that
	 * tick, so viewers see both the title and icon change together.
	 */
	hiddenTitles?: string[];

	titleCycleMs?: number;
}

function extractLeadingEmoji(s: string): string | null {
	const match = s.match(/\p{Extended_Pictographic}(?:\u200D\p{Extended_Pictographic})*\uFE0F?/u);
	return match ? match[0] : null;
}

function emojiToFaviconUrl(emoji: string): string {
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">${emoji}</text></svg>`;
	return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function useReEngagement(opts: UseReEngagementOpts = {}) {
	const {
		modalAfterMs = 15_000,
		onReturn,
		hiddenTitles = ['👀 Вернись!', '🔥 Не упусти!', '🏃 Ты куда?'],
		titleCycleMs = 1500,
	} = opts;

	const [modalOpen, setModalOpen] = useState(false);
	const firedModalRef = useRef(false);
	const hiddenAtRef = useRef<number | null>(null);
	const originalTitleRef = useRef<string | null>(null);
	const originalFaviconRef = useRef<string | null>(null);
	const createdFaviconElRef = useRef<HTMLLinkElement | null>(null);
	const titleIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

	// Keep the latest onReturn in a ref so the effect doesn't re-subscribe on
	// every render of the host component.
	const onReturnRef = useRef(onReturn);
	useEffect(() => {
		onReturnRef.current = onReturn;
	}, [onReturn]);

	useEffect(() => {
		if (typeof document === 'undefined') return;

		const faviconUrls = hiddenTitles.map(t => {
			const e = extractLeadingEmoji(t);
			return e ? emojiToFaviconUrl(e) : null;
		});

		const getFaviconEl = (): HTMLLinkElement | null =>
			document.querySelector<HTMLLinkElement>("link[rel~='icon']");

		const ensureFaviconEl = (): HTMLLinkElement => {
			let el = getFaviconEl();
			if (!el) {
				el = document.createElement('link');
				el.rel = 'icon';
				document.head.appendChild(el);
				createdFaviconElRef.current = el;
			}
			return el;
		};

		const restoreFavicon = () => {
			if (createdFaviconElRef.current) {
				createdFaviconElRef.current.remove();
				createdFaviconElRef.current = null;
				originalFaviconRef.current = null;
				return;
			}
			if (originalFaviconRef.current != null) {
				const el = getFaviconEl();
				if (el) el.href = originalFaviconRef.current;
			}
		};

		function handleHidden() {
			hiddenAtRef.current = Date.now();

			if (originalTitleRef.current == null) {
				originalTitleRef.current = document.title;
			}

			const favEl = ensureFaviconEl();
			if (
				originalFaviconRef.current == null &&
				createdFaviconElRef.current == null
			) {
				originalFaviconRef.current = favEl.href || null;
			}

			if (hiddenTitles.length > 0 && titleIntervalRef.current == null) {
				let i = 0;
				const tick = () => {
					const idx = i % hiddenTitles.length;
					document.title = hiddenTitles[idx];
					const url = faviconUrls[idx];
					if (url) favEl.href = url;
					i += 1;
				};
				tick();
				titleIntervalRef.current = setInterval(tick, titleCycleMs);
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
			restoreFavicon();

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
			restoreFavicon();
		};
	}, [modalAfterMs, hiddenTitles, titleCycleMs]);

	return {
		modalOpen,
		closeModal: () => setModalOpen(false),
	};
}
