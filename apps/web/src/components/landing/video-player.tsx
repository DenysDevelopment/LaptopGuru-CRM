'use client';

import {
	useCallback,
	useEffect,
	useRef,
	useState,
	type PointerEvent as ReactPointerEvent,
	type SyntheticEvent,
} from 'react';

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

export default function VideoPlayer(props: Props) {
	const wrapperRef = useRef<HTMLDivElement>(null);
	const [isFs, setIsFs] = useState(false);

	const toggleFs = useCallback(() => {
		setIsFs(v => !v);
	}, []);

	// Exit on Escape
	useEffect(() => {
		if (!isFs) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') setIsFs(false);
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [isFs]);

	// Neutralize `transform` / `filter` / `perspective` on ancestors while in
	// pseudo-fullscreen. Any such property creates a containing block for
	// position: fixed, which would pin our overlay to that ancestor instead of
	// the viewport (see CSS Transforms spec §6, "Transformed elements"). The
	// landing page uses `[data-animate] { transform: translateY(...) }` as an
	// intersection-observer animation, which triggers this exact issue.
	useEffect(() => {
		if (!isFs) return;
		const wrapper = wrapperRef.current;
		if (!wrapper) return;

		const touched: Array<{ el: HTMLElement; prop: string; prev: string }> = [];
		const neutralize = (el: HTMLElement, prop: 'transform' | 'filter' | 'perspective') => {
			touched.push({ el, prop, prev: el.style.getPropertyValue(prop) });
			el.style.setProperty(prop, 'none', 'important');
		};

		let node: HTMLElement | null = wrapper.parentElement;
		while (node && node !== document.body && node !== document.documentElement) {
			const cs = getComputedStyle(node);
			if (cs.transform !== 'none') neutralize(node, 'transform');
			if (cs.filter !== 'none') neutralize(node, 'filter');
			if (cs.perspective !== 'none') neutralize(node, 'perspective');
			node = node.parentElement;
		}

		return () => {
			for (const { el, prop, prev } of touched) {
				if (prev) el.style.setProperty(prop, prev);
				else el.style.removeProperty(prop);
			}
		};
	}, [isFs]);

	const requestFullscreen = useCallback(() => {
		setIsFs(true);
	}, []);

	return (
		<div
			ref={wrapperRef}
			className={`relative h-full w-full ${isFs ? 'video-pseudo-fs' : ''}`}>
			<PlayerInstance
				key={props.src}
				{...props}
				isFs={isFs}
				onRequestFullscreen={isFs ? undefined : requestFullscreen}
			/>
			<button
				type='button'
				onClick={toggleFs}
				aria-label={isFs ? 'Exit fullscreen' : 'Enter fullscreen'}
				className='absolute bottom-14 right-2 z-[10000] flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm transition-colors hover:bg-black/70 active:scale-95'>
				{isFs ? (
					<svg
						xmlns='http://www.w3.org/2000/svg'
						viewBox='0 0 24 24'
						fill='none'
						stroke='currentColor'
						strokeWidth={2}
						strokeLinecap='round'
						strokeLinejoin='round'
						className='h-5 w-5'>
						<path d='M8 3v4a1 1 0 0 1-1 1H3' />
						<path d='M21 8h-4a1 1 0 0 1-1-1V3' />
						<path d='M3 16h4a1 1 0 0 1 1 1v4' />
						<path d='M16 21v-4a1 1 0 0 1 1-1h4' />
					</svg>
				) : (
					<svg
						xmlns='http://www.w3.org/2000/svg'
						viewBox='0 0 24 24'
						fill='none'
						stroke='currentColor'
						strokeWidth={2}
						strokeLinecap='round'
						strokeLinejoin='round'
						className='h-5 w-5'>
						<path d='M3 7V5a2 2 0 0 1 2-2h2' />
						<path d='M17 3h2a2 2 0 0 1 2 2v2' />
						<path d='M21 17v2a2 2 0 0 1-2 2h-2' />
						<path d='M7 21H5a2 2 0 0 1-2-2v-2' />
					</svg>
				)}
			</button>
		</div>
	);
}

function PlayerInstance({
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
	onRequestFullscreen,
	isFs,
}: Props & { onRequestFullscreen?: () => void; isFs: boolean }) {
	const videoRef = useRef<HTMLVideoElement>(null);
	const barRef = useRef<HTMLDivElement>(null);

	// --- Analytics refs (preserved from previous implementation) ---
	const lastKnownTime = useRef(0);
	const seekFromCapture = useRef(0);
	const isSeeking = useRef(false);
	const isBuffering = useRef(false);

	// --- UI state ---
	const [isPlaying, setIsPlaying] = useState(false);
	const [currentTime, setCurrentTime] = useState(0);
	const [duration, setDuration] = useState(0);
	const [controlsVisible, setControlsVisible] = useState(true);
	const [nearEnd, setNearEnd] = useState(false);
	const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const isScrubbingRef = useRef(false);

	// Show controls and schedule auto-hide (only when playing).
	const scheduleHide = useCallback(() => {
		if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
		const video = videoRef.current;
		if (!video || video.paused) return;
		hideTimerRef.current = setTimeout(() => {
			setControlsVisible(false);
		}, 2500);
	}, []);

	const showControls = useCallback(() => {
		setControlsVisible(true);
		scheduleHide();
	}, [scheduleHide]);

	useEffect(() => {
		return () => {
			if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
		};
	}, []);

	// --- Play/pause ---
	const handleTogglePlay = useCallback(() => {
		const video = videoRef.current;
		if (!video) return;
		if (video.paused) {
			void video.play().catch(() => {
				/* autoplay policy / interrupted — ignore */
			});
			// Auto-enter pseudo-fullscreen on any play action (big center
			// button, bottom bar, tap on video). Parent passes undefined when
			// already in fs, so this is a no-op in that case.
			onRequestFullscreen?.();
		} else {
			video.pause();
		}
		showControls();
	}, [showControls, onRequestFullscreen]);

	const handlePlay = useCallback(() => {
		setIsPlaying(true);
		setNearEnd(false);
		onPlay();
		scheduleHide();
	}, [onPlay, scheduleHide]);

	const handlePause = useCallback(() => {
		setIsPlaying(false);
		setControlsVisible(true);
		if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
		onPause();
	}, [onPause]);

	// --- Analytics handlers (preserved) ---
	const handleTimeUpdate = useCallback(
		(event: SyntheticEvent<HTMLVideoElement>) => {
			const video = event.currentTarget;
			const t = video.currentTime;
			const d = video.duration;
			if (!isSeeking.current) lastKnownTime.current = t;
			setCurrentTime(t);
			if (Number.isFinite(d) && d > 0) setDuration(d);
			onTimeUpdate(t);
			setNearEnd(Number.isFinite(d) && d > 0 && d - t <= 10);
		},
		[onTimeUpdate],
	);

	const handleSeeking = useCallback(() => {
		if (!isSeeking.current) {
			seekFromCapture.current = lastKnownTime.current;
			isSeeking.current = true;
		}
	}, []);

	const handleSeeked = useCallback(
		(event: SyntheticEvent<HTMLVideoElement>) => {
			isSeeking.current = false;
			const t = event.currentTarget.currentTime;
			onSeeked(seekFromCapture.current, t);
			lastKnownTime.current = t;
		},
		[onSeeked],
	);

	const handleWaiting = useCallback(() => {
		if (!isBuffering.current) {
			isBuffering.current = true;
			onBufferStart();
		}
	}, [onBufferStart]);

	const handlePlaying = useCallback(() => {
		if (isBuffering.current) {
			isBuffering.current = false;
			onBufferEnd();
		}
	}, [onBufferEnd]);

	const handleLoadedMetadata = useCallback(
		(event: SyntheticEvent<HTMLVideoElement>) => {
			const d = event.currentTarget.duration;
			if (Number.isFinite(d) && d > 0) setDuration(d);
		},
		[],
	);

	// --- Seek via progress bar (pointer events: touch + mouse unified) ---
	const seekFromPointer = useCallback(
		(clientX: number) => {
			const bar = barRef.current;
			const video = videoRef.current;
			if (!bar || !video || !Number.isFinite(video.duration)) return;
			const rect = bar.getBoundingClientRect();
			const pct = Math.max(
				0,
				Math.min(1, (clientX - rect.left) / rect.width),
			);
			video.currentTime = pct * video.duration;
			setCurrentTime(video.currentTime);
		},
		[],
	);

	const handleBarPointerDown = useCallback(
		(e: ReactPointerEvent<HTMLDivElement>) => {
			isScrubbingRef.current = true;
			e.currentTarget.setPointerCapture(e.pointerId);
			seekFromPointer(e.clientX);
			showControls();
		},
		[seekFromPointer, showControls],
	);

	const handleBarPointerMove = useCallback(
		(e: ReactPointerEvent<HTMLDivElement>) => {
			if (!isScrubbingRef.current) return;
			seekFromPointer(e.clientX);
		},
		[seekFromPointer],
	);

	const handleBarPointerUp = useCallback(
		(e: ReactPointerEvent<HTMLDivElement>) => {
			if (!isScrubbingRef.current) return;
			isScrubbingRef.current = false;
			try {
				e.currentTarget.releasePointerCapture(e.pointerId);
			} catch {
				/* pointer already released */
			}
		},
		[],
	);

	const progressPct =
		duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

	return (
		<>
			<video
				ref={videoRef}
				src={src}
				poster={poster}
				playsInline
				// Legacy iOS attribute — required for older Safari versions to keep
				// playback inline. React does not know about it, hence the cast.
				{...({ 'webkit-playsinline': 'true' } as Record<string, string>)}
				{...({ 'x-webkit-airplay': 'deny' } as Record<string, string>)}
				disablePictureInPicture
				disableRemotePlayback
				preload='auto'
				className='absolute inset-0 h-full w-full object-cover'
				onClick={handleTogglePlay}
				onPlay={handlePlay}
				onPause={handlePause}
				onEnded={onEnded}
				onTimeUpdate={handleTimeUpdate}
				onSeeking={handleSeeking}
				onSeeked={handleSeeked}
				onWaiting={handleWaiting}
				onPlaying={handlePlaying}
				onLoadedMetadata={handleLoadedMetadata}
				onMouseMove={showControls}
			/>

			{/* Big center play button — visible when paused */}
			{!isPlaying && (
				<button
					type='button'
					onClick={handleTogglePlay}
					aria-label='Play'
					className='absolute inset-0 z-[50] flex items-center justify-center'>
					<span className='flex h-20 w-20 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm transition-transform active:scale-95'>
						<svg
							xmlns='http://www.w3.org/2000/svg'
							viewBox='0 0 24 24'
							fill='currentColor'
							className='ml-1 h-8 w-8'>
							<path d='M8 5v14l11-7z' />
						</svg>
					</span>
				</button>
			)}

			{/* Bottom controls — auto-hide after 2.5s of inactivity while playing */}
			<div
				className={`pointer-events-none absolute inset-x-0 bottom-0 z-[60] bg-gradient-to-t from-black/70 to-transparent px-3 pt-8 pb-3 transition-opacity duration-200 ${
					controlsVisible ? 'opacity-100' : 'opacity-0'
				}`}>
				<div className='pointer-events-auto flex items-center gap-3'>
					<button
						type='button'
						onClick={handleTogglePlay}
						aria-label={isPlaying ? 'Pause' : 'Play'}
						className='flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-sm transition-colors hover:bg-white/25 active:scale-95'>
						{isPlaying ? (
							<svg
								xmlns='http://www.w3.org/2000/svg'
								viewBox='0 0 24 24'
								fill='currentColor'
								className='h-4 w-4'>
								<path d='M6 5h4v14H6zM14 5h4v14h-4z' />
							</svg>
						) : (
							<svg
								xmlns='http://www.w3.org/2000/svg'
								viewBox='0 0 24 24'
								fill='currentColor'
								className='ml-0.5 h-4 w-4'>
								<path d='M8 5v14l11-7z' />
							</svg>
						)}
					</button>
					<div
						ref={barRef}
						role='slider'
						aria-label='Seek'
						aria-valuemin={0}
						aria-valuemax={duration || 0}
						aria-valuenow={currentTime}
						tabIndex={-1}
						onPointerDown={handleBarPointerDown}
						onPointerMove={handleBarPointerMove}
						onPointerUp={handleBarPointerUp}
						onPointerCancel={handleBarPointerUp}
						className='relative flex h-5 flex-1 cursor-pointer touch-none items-center'>
						<div className='h-1.5 w-full overflow-hidden rounded-full bg-white/30'>
							<div
								className='h-full rounded-full bg-[#fb7830] transition-[width] duration-75'
								style={{ width: `${progressPct}%` }}
							/>
						</div>
					</div>
					<span className='flex-shrink-0 font-mono text-xs text-white tabular-nums select-none'>
						{formatTime(currentTime)} / {formatTime(duration)}
					</span>
				</div>
			</div>

			{/* CTA: always visible in fullscreen, last 10s in inline mode. */}
			{(isFs || nearEnd) && productUrl && (
				<div className='pointer-events-none absolute inset-0 z-[70] flex items-end justify-center pb-20'>
					<a
						href={productUrl}
						target='_blank'
						rel='noopener noreferrer'
						onClick={e => {
							e.preventDefault();
							window.open(productUrl, '_blank');
						}}
						className='pointer-events-auto rounded-xl bg-gradient-to-r from-[#fb7830] to-[#e56a25] px-8 py-4 text-lg font-bold text-white shadow-[0_6px_28px_rgba(251,120,48,0.5)] transition-all hover:from-[#e56a25] hover:to-[#d45a15] active:scale-[0.98]'>
						{buyButtonText || 'Купити'}
					</a>
				</div>
			)}
		</>
	);
}

function formatTime(seconds: number): string {
	if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
	const total = Math.floor(seconds);
	const m = Math.floor(total / 60);
	const s = total % 60;
	return `${m}:${s.toString().padStart(2, '0')}`;
}
