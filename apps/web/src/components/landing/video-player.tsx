'use client';

import { Plyr } from 'plyr-react';
import 'plyr-react/plyr.css';
import { useCallback, useEffect, useRef, useState } from 'react';

interface Props {
	src: string;
	poster: string;
	onPlay: () => void;
	onPause: () => void;
	onEnded: () => void;
	onTimeUpdate: (currentTime: number) => void;
	onSeeked: (seekFrom: number, seekTo: number) => void;
	onBufferStart: () => void;
	onBufferEnd: () => void;
	productUrl?: string;
	buyButtonText?: string;
}

function isIOS(): boolean {
	if (typeof navigator === 'undefined') return false;
	return /iPhone|iPod/.test(navigator.userAgent);
}

function isTouchDevice(): boolean {
	if (typeof window === 'undefined') return false;
	return window.matchMedia('(hover: none) and (pointer: coarse)').matches;
}

type AnyDoc = Document & {
	webkitFullscreenElement?: Element | null;
	mozFullScreenElement?: Element | null;
	webkitExitFullscreen?: () => Promise<void> | void;
	mozCancelFullScreen?: () => Promise<void> | void;
	msExitFullscreen?: () => Promise<void> | void;
};

type AnyEl = HTMLElement & {
	webkitRequestFullscreen?: () => Promise<void> | void;
	mozRequestFullScreen?: () => Promise<void> | void;
	msRequestFullscreen?: () => Promise<void> | void;
};

function nativeFullscreenElement(): Element | null {
	const doc = document as AnyDoc;
	return (
		doc.fullscreenElement ??
		doc.webkitFullscreenElement ??
		doc.mozFullScreenElement ??
		null
	);
}

function callRequestFullscreen(el: HTMLElement): Promise<void> | void {
	const e = el as AnyEl;
	const req =
		e.requestFullscreen ||
		e.webkitRequestFullscreen ||
		e.mozRequestFullScreen ||
		e.msRequestFullscreen;
	if (!req) return;
	try {
		return req.call(e) as Promise<void> | void;
	} catch {
		return undefined;
	}
}

function callExitFullscreen(): Promise<void> | void {
	const doc = document as AnyDoc;
	const exit =
		doc.exitFullscreen ||
		doc.webkitExitFullscreen ||
		doc.mozCancelFullScreen ||
		doc.msExitFullscreen;
	if (!exit) return;
	try {
		return exit.call(doc) as Promise<void> | void;
	} catch {
		return undefined;
	}
}

export default function VideoPlayer({
	src,
	poster,
	onPlay,
	onPause,
	onEnded,
	onTimeUpdate,
	onSeeked,
	onBufferStart,
	onBufferEnd,
	productUrl,
	buyButtonText,
}: Props) {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- plyr-react ref type changes between versions
	const plyrRef = useRef<any>(null);
	const callbacksRef = useRef({
		onPlay,
		onPause,
		onEnded,
		onTimeUpdate,
		onSeeked,
		onBufferStart,
		onBufferEnd,
	});
	const isBuffering = useRef(false);
	const lastKnownTime = useRef(0);
	const seekFromCapture = useRef(0);
	const isSeeking = useRef(false);
	const boundRef = useRef(false);
	const wrapperRef = useRef<HTMLDivElement>(null);

	const [nearEnd, setNearEnd] = useState(false);
	const [isFullscreen, setIsFullscreen] = useState(false);

	useEffect(() => {
		callbacksRef.current = { onPlay, onPause, onEnded, onTimeUpdate, onSeeked, onBufferStart, onBufferEnd };
	}, [onPlay, onPause, onEnded, onTimeUpdate, onSeeked, onBufferStart, onBufferEnd]);

	const handlePlay = useCallback(() => {
		setNearEnd(false);
		callbacksRef.current.onPlay();
	}, []);
	const handlePause = useCallback(() => callbacksRef.current.onPause(), []);
	const handleEnded = useCallback(() => callbacksRef.current.onEnded(), []);
	const handleTimeUpdate = useCallback(() => {
		const p = plyrRef.current?.plyr;
		if (!p) return;
		if (!isSeeking.current) {
			lastKnownTime.current = p.currentTime;
		}
		callbacksRef.current.onTimeUpdate(p.currentTime);
		if (p.duration > 0 && p.duration - p.currentTime <= 10) {
			setNearEnd(true);
		} else {
			setNearEnd(false);
		}
	}, []);
	const handleSeeking = useCallback(() => {
		if (!isSeeking.current) {
			seekFromCapture.current = lastKnownTime.current;
			isSeeking.current = true;
		}
	}, []);
	const handleSeeked = useCallback(() => {
		const p = plyrRef.current?.plyr;
		isSeeking.current = false;
		if (p) {
			callbacksRef.current.onSeeked(seekFromCapture.current, p.currentTime);
			lastKnownTime.current = p.currentTime;
		}
	}, []);
	const handleWaiting = useCallback(() => {
		if (!isBuffering.current) {
			isBuffering.current = true;
			callbacksRef.current.onBufferStart();
		}
	}, []);
	const handlePlaying = useCallback(() => {
		if (isBuffering.current) {
			isBuffering.current = false;
			callbacksRef.current.onBufferEnd();
		}
	}, []);

	useEffect(() => {
		function bind(plyr: {
			on: (e: string, cb: () => void) => void;
			off: (e: string, cb: () => void) => void;
		}) {
			if (boundRef.current) return;
			boundRef.current = true;
			plyr.on('play', handlePlay);
			plyr.on('pause', handlePause);
			plyr.on('ended', handleEnded);
			plyr.on('timeupdate', handleTimeUpdate);
			plyr.on('seeking', handleSeeking);
			plyr.on('seeked', handleSeeked);
			plyr.on('waiting', handleWaiting);
			plyr.on('playing', handlePlaying);
		}

		function unbind(plyr: { off: (e: string, cb: () => void) => void }) {
			plyr.off('play', handlePlay);
			plyr.off('pause', handlePause);
			plyr.off('ended', handleEnded);
			plyr.off('timeupdate', handleTimeUpdate);
			plyr.off('seeking', handleSeeking);
			plyr.off('seeked', handleSeeked);
			plyr.off('waiting', handleWaiting);
			plyr.off('playing', handlePlaying);
			boundRef.current = false;
		}

		const player = plyrRef.current?.plyr;
		if (player && typeof player.on === 'function') {
			bind(player);
			return () => unbind(player);
		}

		const id = setInterval(() => {
			const p = plyrRef.current?.plyr;
			if (p && typeof p.on === 'function') {
				clearInterval(id);
				bind(p);
			}
		}, 200);
		const currentPlyrRef = plyrRef.current;
		return () => {
			clearInterval(id);
			const p = currentPlyrRef?.plyr;
			if (p && typeof p.off === 'function') unbind(p);
		};
	}, [
		handlePlay,
		handlePause,
		handleEnded,
		handleTimeUpdate,
		handleSeeking,
		handleSeeked,
		handleWaiting,
		handlePlaying,
	]);

	// Fullscreen is handled entirely by us, not Plyr:
	//   - Plyr's fullscreen.container option does NOT actually put the
	//     container in :fullscreen — it still fullscreens .plyr, which
	//     leaves our CTA button (a sibling of .plyr inside the wrapper)
	//     outside the top layer and invisible.
	//   - On iOS Safari requestFullscreen on an arbitrary element is
	//     unsupported; we use a CSS fallback class instead.
	// That's why Plyr's built-in fullscreen button is removed from the
	// controls list and a custom expand/collapse button is rendered at
	// the bottom of the player instead.

	const enterFullscreen = useCallback(() => {
		const wrapper = wrapperRef.current;
		if (!wrapper) return;
		if (wrapper.classList.contains('plyr-ios-fullscreen')) return;
		if (nativeFullscreenElement()) return;
		if (isIOS()) {
			// iOS: CSS fallback — pin the wrapper to the viewport.
			wrapper.classList.add('plyr-ios-fullscreen');
			document.documentElement.classList.add('plyr-is-fullscreen');
			document.body.style.overflow = 'hidden';
			setIsFullscreen(true);
			return;
		}
		// Android/desktop: real native fullscreen on the wrapper.
		const result = callRequestFullscreen(wrapper);
		if (result && typeof (result as Promise<void>).catch === 'function') {
			(result as Promise<void>).catch(() => {
				/* gesture lost / blocked — ignore */
			});
		}
	}, []);

	const exitFullscreen = useCallback(() => {
		const wrapper = wrapperRef.current;
		if (!wrapper) return;
		if (wrapper.classList.contains('plyr-ios-fullscreen')) {
			wrapper.classList.remove('plyr-ios-fullscreen');
			document.documentElement.classList.remove('plyr-is-fullscreen');
			document.body.style.overflow = '';
			setIsFullscreen(false);
			return;
		}
		callExitFullscreen();
	}, []);

	// Sync state with native fullscreen changes + lock body scroll + try
	// orientation lock to portrait on Android for the 9:16 video.
	useEffect(() => {
		const wrapper = wrapperRef.current;
		if (!wrapper) return;

		// Plyr sets `aspect-ratio: 9/16` on .plyr and .plyr__video-wrapper
		// (and sometimes inline styles from its ratio math). CSS !important
		// overrides usually win, but Plyr can re-apply inline styles on
		// resize/timeupdate which may race with our CSS cascade. Forcing
		// inline styles from JS when entering fullscreen is bulletproof.
		const FS_INLINE_STYLE =
			'width:100% !important;height:100% !important;max-width:none !important;max-height:none !important;min-width:0 !important;min-height:0 !important;padding:0 !important;aspect-ratio:auto !important;flex:1 1 auto !important;';
		const VIDEO_FS_INLINE_STYLE =
			'width:100% !important;height:100% !important;max-width:none !important;max-height:none !important;object-fit:contain !important;';

		const applyFsInlineStyles = () => {
			const plyr = wrapper.querySelector<HTMLElement>('.plyr');
			const videoWrapper = wrapper.querySelector<HTMLElement>('.plyr__video-wrapper');
			const video = wrapper.querySelector<HTMLElement>('video');
			if (plyr) plyr.setAttribute('style', FS_INLINE_STYLE);
			if (videoWrapper) videoWrapper.setAttribute('style', FS_INLINE_STYLE);
			if (video) video.setAttribute('style', VIDEO_FS_INLINE_STYLE);
		};
		const clearFsInlineStyles = () => {
			const plyr = wrapper.querySelector<HTMLElement>('.plyr');
			const videoWrapper = wrapper.querySelector<HTMLElement>('.plyr__video-wrapper');
			const video = wrapper.querySelector<HTMLElement>('video');
			if (plyr) plyr.removeAttribute('style');
			if (videoWrapper) videoWrapper.removeAttribute('style');
			if (video) video.removeAttribute('style');
		};

		const onChange = () => {
			const isNative = nativeFullscreenElement() === wrapper;
			const isFake = wrapper.classList.contains('plyr-ios-fullscreen');
			const active = isNative || isFake;
			setIsFullscreen(active);
			if (active) {
				document.documentElement.classList.add('plyr-is-fullscreen');
				document.body.style.overflow = 'hidden';
				applyFsInlineStyles();
				// Plyr re-applies styles on resize; re-assert ours next tick
				// and after the transition-end of the fullscreen animation.
				requestAnimationFrame(applyFsInlineStyles);
				setTimeout(applyFsInlineStyles, 200);
				if (isNative) {
					const orientation = (screen as Screen & {
						orientation?: ScreenOrientation & { lock?: (o: string) => Promise<void> };
					}).orientation;
					if (orientation && typeof orientation.lock === 'function') {
						orientation.lock('portrait').catch(() => {
							/* not allowed — ignore */
						});
					}
				}
			} else {
				document.documentElement.classList.remove('plyr-is-fullscreen');
				document.body.style.overflow = '';
				clearFsInlineStyles();
				const orientation = (screen as Screen & {
					orientation?: ScreenOrientation & { unlock?: () => void };
				}).orientation;
				if (orientation && typeof orientation.unlock === 'function') {
					try {
						orientation.unlock();
					} catch {
						/* ignore */
					}
				}
			}
		};

		document.addEventListener('fullscreenchange', onChange);
		document.addEventListener('webkitfullscreenchange', onChange);
		return () => {
			document.removeEventListener('fullscreenchange', onChange);
			document.removeEventListener('webkitfullscreenchange', onChange);
			document.documentElement.classList.remove('plyr-is-fullscreen');
			document.body.style.overflow = '';
		};
	}, []);

	// Escape closes iOS fake fullscreen (native fullscreen already exits on Esc).
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key !== 'Escape') return;
			const wrapper = wrapperRef.current;
			if (!wrapper?.classList.contains('plyr-ios-fullscreen')) return;
			exitFullscreen();
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [exitFullscreen]);

	// Auto-enter fullscreen on touch devices when the user taps play.
	// Bound in capture phase so we run inside the user-gesture stack even
	// though Plyr is about to handle the same click.
	useEffect(() => {
		const wrapper = wrapperRef.current;
		if (!wrapper) return;
		if (!isTouchDevice()) return;

		const onClickCapture = (e: Event) => {
			const target = e.target as HTMLElement | null;
			if (!target) return;
			const isPlayClick =
				target.closest('.plyr__control--overlaid') ||
				target.closest('button[data-plyr="play"]') ||
				target.closest('.plyr__poster');
			if (!isPlayClick) return;
			const p = plyrRef.current?.plyr;
			if (!p || !p.paused) return;
			enterFullscreen();
		};
		wrapper.addEventListener('click', onClickCapture, true);
		return () => wrapper.removeEventListener('click', onClickCapture, true);
	}, [enterFullscreen]);

	const showCta = Boolean(productUrl) && (isFullscreen || nearEnd);

	return (
		<div
			ref={wrapperRef}
			className='plyr-fullscreen-wrapper relative'
			style={{ '--plyr-color-main': '#fb7830' } as React.CSSProperties}>
			<Plyr
				ref={plyrRef}
				source={{
					type: 'video' as const,
					sources: [{ src, type: 'video/mp4' }],
					poster,
					title: 'Course Introduction Video',
				}}
				options={{
					// NOTE: deliberately NOT setting `ratio: '9:16'`. Plyr's
					// ratio option puts `aspect-ratio: 9/16` on .plyr and
					// .plyr__video-wrapper, and in fullscreen Plyr's own JS
					// re-asserts that aspect-ratio after our CSS cascades —
					// so the video stays 9:16 inside a viewport-sized black
					// box. The outer landing wrapper already constrains the
					// inline layout to aspect-[9/16] max-w-[240px], so we
					// don't need Plyr's ratio at all.
					controls: [
						'play-large',
						'play',
						'progress',
						'current-time',
						'mute',
					],
					fullscreen: {
						enabled: false,
						fallback: false,
						iosNative: false,
					},
				}}
			/>
			{/* Custom fullscreen toggle (Plyr's built-in one is disabled). */}
			<button
				type='button'
				aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
				onClick={isFullscreen ? exitFullscreen : enterFullscreen}
				className={`plyr-fs-toggle absolute z-[10000] h-10 w-10 rounded-full
					bg-black/60 text-white text-xl leading-none
					flex items-center justify-center
					backdrop-blur-sm shadow-lg
					hover:bg-black/80 transition-colors
					${isFullscreen ? 'top-3 right-3' : 'bottom-2 right-2'}`}>
				{isFullscreen ? '×' : '⛶'}
			</button>
			{showCta && (
				<div className='plyr-fs-cta absolute inset-x-0 bottom-0 z-[9999] flex justify-center px-4 pb-6 pointer-events-none'>
					<a
						href={productUrl}
						target='_blank'
						rel='noopener noreferrer'
						onClick={e => {
							e.preventDefault();
							window.open(productUrl, '_blank');
						}}
						className='pointer-events-auto w-full max-w-[320px] text-center px-6 py-4 rounded-xl text-white text-lg font-bold
							bg-gradient-to-r from-[#fb7830] to-[#e56a25]
							hover:from-[#e56a25] hover:to-[#d45a15]
							shadow-[0_6px_28px_rgba(251,120,48,0.5)]
							transition-all active:scale-[0.98]
							animate-bounce'>
						{buyButtonText || 'Купити'}
					</a>
				</div>
			)}
		</div>
	);
}
