'use client';

import '@videojs/react/video/skin.css';

import { createPlayer } from '@videojs/react';
import { Video, VideoSkin, videoFeatures } from '@videojs/react/video';
import { useCallback, useRef, useState, type SyntheticEvent } from 'react';

const Player = createPlayer({ features: videoFeatures });

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
	return (
		<div className='relative h-full w-full'>
			<PlayerInstance key={props.src} {...props} />
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
}: Props) {
	const lastKnownTime = useRef(0);
	const seekFromCapture = useRef(0);
	const isSeeking = useRef(false);
	const isBuffering = useRef(false);

	const [nearEnd, setNearEnd] = useState(false);

	const handlePlay = useCallback(() => {
		setNearEnd(false);
		onPlay();
	}, [onPlay]);

	const handleTimeUpdate = useCallback(
		(event: SyntheticEvent<HTMLVideoElement>) => {
			const video = event.currentTarget;
			const currentTime = video.currentTime;
			const duration = video.duration;
			if (!isSeeking.current) lastKnownTime.current = currentTime;
			onTimeUpdate(currentTime);
			setNearEnd(
				Number.isFinite(duration) &&
					duration > 0 &&
					duration - currentTime <= 10,
			);
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
			const currentTime = event.currentTarget.currentTime;
			onSeeked(seekFromCapture.current, currentTime);
			lastKnownTime.current = currentTime;
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

	return (
		<>
			<Player.Provider>
				<VideoSkin poster={poster} className='h-full w-full' style={skinStyle}>
					<Video
						src={src}
						playsInline
						preload='auto'
						onPlay={handlePlay}
						onPause={onPause}
						onEnded={onEnded}
						onTimeUpdate={handleTimeUpdate}
						onSeeking={handleSeeking}
						onSeeked={handleSeeked}
						onWaiting={handleWaiting}
						onPlaying={handlePlaying}
					/>
				</VideoSkin>
			</Player.Provider>
			{nearEnd && productUrl && (
				<div className='pointer-events-none absolute inset-0 z-[9999] flex items-end justify-center pb-20'>
					<a
						href={productUrl}
						target='_blank'
						rel='noopener noreferrer'
						onClick={e => {
							e.preventDefault();
							window.open(productUrl, '_blank');
						}}
						className='pointer-events-auto animate-bounce rounded-xl bg-gradient-to-r from-[#fb7830] to-[#e56a25] px-8 py-4 text-lg font-bold text-white shadow-[0_6px_28px_rgba(251,120,48,0.5)] transition-all hover:from-[#e56a25] hover:to-[#d45a15] active:scale-[0.98]'>
						{buyButtonText || 'Купити'}
					</a>
				</div>
			)}
		</>
	);
}

const skinStyle = {
	'--media-object-fit': 'cover',
	'--media-border-radius': '0',
	'--media-color-primary': '#fb7830',
} as React.CSSProperties;
