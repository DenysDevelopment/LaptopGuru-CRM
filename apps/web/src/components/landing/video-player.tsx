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
	const lastKnownTime = useRef(0); // Tracks position before seek (updated by timeupdate)
	const seekFromCapture = useRef(0); // Captured at 'seeking' before timeupdate overwrites lastKnownTime
	const isSeeking = useRef(false);
	const boundRef = useRef(false);
	const wrapperRef = useRef<HTMLDivElement>(null);

	const [nearEnd, setNearEnd] = useState(false);

	// Keep callbacks ref up to date without re-subscribing events
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
			if (boundRef.current) return; // Prevent double-bind in strict mode
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

		// Plyr instance may not be ready on first render — poll until it is
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

	useEffect(() => {
		const wrapper = wrapperRef.current;
		if (!wrapper) return;
		const onClickCapture = (e: Event) => {
			const target = e.target as HTMLElement | null;
			if (!target) return;
			const isPlayClick =
				target.closest('.plyr__control--overlaid') ||
				target.closest('button[data-plyr="play"]');
			if (!isPlayClick) return;
			const p = plyrRef.current?.plyr;
			if (!p?.fullscreen || p.fullscreen.active || !p.paused) return;
			try {
				p.fullscreen.enter();
			} catch {
				// Fullscreen may be blocked — ignore
			}
		};
		wrapper.addEventListener('click', onClickCapture, true);
		return () => wrapper.removeEventListener('click', onClickCapture, true);
	}, []);

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
					ratio: '9:16',
					controls: [
						'play-large',
						'play',
						'progress',
						'current-time',
						'mute',
						'volume',
						'fullscreen',
					],
					fullscreen: {
						container: '.plyr-fullscreen-wrapper',
					},
				}}
			/>
			{nearEnd && productUrl && (
				<div className='absolute inset-0 z-[9999] flex items-end justify-center pb-20 pointer-events-none'>
					<a
						href={productUrl}
						target='_blank'
						rel='noopener noreferrer'
						onClick={e => {
							e.preventDefault();
							window.open(productUrl, '_blank');
						}}
						className='pointer-events-auto px-8 py-4 rounded-xl text-white text-lg font-bold
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
