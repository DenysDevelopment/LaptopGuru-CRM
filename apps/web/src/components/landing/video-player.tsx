'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- video.js Player type isn't exported cleanly
type VjsPlayer = any;

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
	// video.js mounts itself by replacing a <video-js> element. React must
	// not own that element, so we keep a ref to a parent div and create
	// the <video-js> imperatively. This is the official React integration
	// pattern from the video.js docs.
	const videoHostRef = useRef<HTMLDivElement>(null);
	const wrapperRef = useRef<HTMLDivElement>(null);
	const playerRef = useRef<VjsPlayer | null>(null);
	const callbacksRef = useRef({
		onPlay,
		onPause,
		onEnded,
		onTimeUpdate,
		onSeeked,
		onBufferStart,
		onBufferEnd,
	});
	const lastKnownTime = useRef(0);
	const seekFromCapture = useRef(0);
	const isSeeking = useRef(false);
	const isBuffering = useRef(false);

	const [nearEnd, setNearEnd] = useState(false);
	const [isFullscreen, setIsFullscreen] = useState(false);

	useEffect(() => {
		callbacksRef.current = {
			onPlay,
			onPause,
			onEnded,
			onTimeUpdate,
			onSeeked,
			onBufferStart,
			onBufferEnd,
		};
	}, [
		onPlay,
		onPause,
		onEnded,
		onTimeUpdate,
		onSeeked,
		onBufferStart,
		onBufferEnd,
	]);

	// Initialise video.js once and bind every analytics event we care about.
	// The player is disposed on unmount. React Strict Mode runs effects
	// twice in dev; the cleanup makes that safe.
	useEffect(() => {
		const host = videoHostRef.current;
		if (!host) return;
		if (playerRef.current) return;

		// Create a fresh <video-js> element imperatively so video.js owns
		// it (not React). React Fast Refresh / Strict Mode would otherwise
		// keep handing video.js the same DOM node it already mutated.
		const videoEl = document.createElement('video-js');
		videoEl.classList.add(
			'video-js',
			'vjs-default-skin',
			'vjs-big-play-centered',
			'vjs-fill',
		);
		videoEl.setAttribute('playsinline', '');
		host.appendChild(videoEl);

		const player = videojs(videoEl, {
			controls: true,
			preload: 'metadata',
			poster,
			fluid: false,
			fill: true,
			playsinline: true,
			controlBar: {
				pictureInPictureToggle: false,
				// Hide video.js's built-in fullscreen toggle — we render our
				// own so we can fall back to a CSS overlay on iOS Safari.
				fullscreenToggle: false,
			},
			sources: [{ src, type: 'video/mp4' }],
		});
		playerRef.current = player;

		player.on('play', () => {
			setNearEnd(false);
			callbacksRef.current.onPlay();
		});
		player.on('pause', () => callbacksRef.current.onPause());
		player.on('ended', () => callbacksRef.current.onEnded());
		player.on('timeupdate', () => {
			const t = (player.currentTime() ?? 0) as number;
			const d = (player.duration() ?? 0) as number;
			if (!isSeeking.current) lastKnownTime.current = t;
			callbacksRef.current.onTimeUpdate(t);
			if (d > 0 && d - t <= 10) setNearEnd(true);
			else setNearEnd(false);
		});
		player.on('seeking', () => {
			if (!isSeeking.current) {
				seekFromCapture.current = lastKnownTime.current;
				isSeeking.current = true;
			}
		});
		player.on('seeked', () => {
			const t = (player.currentTime() ?? 0) as number;
			isSeeking.current = false;
			callbacksRef.current.onSeeked(seekFromCapture.current, t);
			lastKnownTime.current = t;
		});
		player.on('waiting', () => {
			if (!isBuffering.current) {
				isBuffering.current = true;
				callbacksRef.current.onBufferStart();
			}
		});
		player.on('playing', () => {
			if (isBuffering.current) {
				isBuffering.current = false;
				callbacksRef.current.onBufferEnd();
			}
		});

		return () => {
			try {
				player.dispose();
			} catch {
				/* ignore */
			}
			playerRef.current = null;
		};
	}, [poster, src]);

	// Fullscreen — entirely custom, like the previous Plyr implementation.
	const enterFullscreen = useCallback(() => {
		const wrapper = wrapperRef.current;
		if (!wrapper) return;
		if (wrapper.classList.contains('vjs-ios-fullscreen')) return;
		if (nativeFullscreenElement()) return;
		if (isIOS()) {
			wrapper.classList.add('vjs-ios-fullscreen');
			document.documentElement.classList.add('vjs-is-fullscreen');
			document.body.style.overflow = 'hidden';
			setIsFullscreen(true);
			return;
		}
		const result = callRequestFullscreen(wrapper);
		if (result && typeof (result as Promise<void>).catch === 'function') {
			(result as Promise<void>).catch(() => undefined);
		}
	}, []);

	const exitFullscreen = useCallback(() => {
		const wrapper = wrapperRef.current;
		if (!wrapper) return;
		if (wrapper.classList.contains('vjs-ios-fullscreen')) {
			wrapper.classList.remove('vjs-ios-fullscreen');
			document.documentElement.classList.remove('vjs-is-fullscreen');
			document.body.style.overflow = '';
			setIsFullscreen(false);
			return;
		}
		callExitFullscreen();
	}, []);

	useEffect(() => {
		const wrapper = wrapperRef.current;
		if (!wrapper) return;
		const onChange = () => {
			const isNative = nativeFullscreenElement() === wrapper;
			const isFake = wrapper.classList.contains('vjs-ios-fullscreen');
			const active = isNative || isFake;
			setIsFullscreen(active);
			if (active) {
				document.documentElement.classList.add('vjs-is-fullscreen');
				document.body.style.overflow = 'hidden';
				if (isNative) {
					const orientation = (
						screen as Screen & {
							orientation?: ScreenOrientation & {
								lock?: (o: string) => Promise<void>;
							};
						}
					).orientation;
					if (orientation && typeof orientation.lock === 'function') {
						orientation.lock('portrait').catch(() => undefined);
					}
				}
			} else {
				document.documentElement.classList.remove('vjs-is-fullscreen');
				document.body.style.overflow = '';
				const orientation = (
					screen as Screen & {
						orientation?: ScreenOrientation & { unlock?: () => void };
					}
				).orientation;
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
			document.documentElement.classList.remove('vjs-is-fullscreen');
			document.body.style.overflow = '';
		};
	}, []);

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key !== 'Escape') return;
			const wrapper = wrapperRef.current;
			if (!wrapper?.classList.contains('vjs-ios-fullscreen')) return;
			exitFullscreen();
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [exitFullscreen]);

	// Auto-enter fullscreen on play tap on touch devices.
	useEffect(() => {
		const wrapper = wrapperRef.current;
		if (!wrapper) return;
		if (!isTouchDevice()) return;
		const onClickCapture = (e: Event) => {
			const target = e.target as HTMLElement | null;
			if (!target) return;
			const isPlayClick =
				target.closest('.vjs-big-play-button') ||
				target.closest('.vjs-play-control') ||
				target.closest('.vjs-poster') ||
				target.tagName === 'VIDEO';
			if (!isPlayClick) return;
			const player = playerRef.current;
			if (!player) return;
			if (!player.paused()) return;
			enterFullscreen();
		};
		wrapper.addEventListener('click', onClickCapture, true);
		return () => wrapper.removeEventListener('click', onClickCapture, true);
	}, [enterFullscreen]);

	const showCta = Boolean(productUrl) && (isFullscreen || nearEnd);

	return (
		<div ref={wrapperRef} className='vjs-fullscreen-wrapper relative'>
			<div
				ref={videoHostRef}
				data-vjs-player='true'
				className='absolute inset-0'
			/>
			<button
				type='button'
				aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
				onClick={isFullscreen ? exitFullscreen : enterFullscreen}
				className={`vjs-fs-toggle absolute z-[10000] h-10 w-10 rounded-full
					bg-black/60 text-white text-xl leading-none
					flex items-center justify-center
					backdrop-blur-sm shadow-lg
					hover:bg-black/80 transition-colors
					${isFullscreen ? 'top-3 right-3' : 'bottom-12 right-2'}`}>
				{isFullscreen ? '×' : '⛶'}
			</button>
			{showCta && (
				<div className='vjs-fs-cta absolute inset-x-0 bottom-0 z-[9999] flex justify-center px-4 pb-6 pointer-events-none'>
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
