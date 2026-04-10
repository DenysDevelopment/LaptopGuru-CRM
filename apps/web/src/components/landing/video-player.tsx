'use client';

import { useEffect, useRef, useCallback } from 'react';
import { Plyr } from 'plyr-react';
import 'plyr-react/plyr.css';

interface Props {
  src: string;
  poster: string;
  onPlay: () => void;
  onPause: () => void;
  onEnded: () => void;
  onTimeUpdate: (currentTime: number) => void;
}

export default function VideoPlayer({ src, poster, onPlay, onPause, onEnded, onTimeUpdate }: Props) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- plyr-react ref type is not exported
  const plyrRef = useRef<Record<string, any>>(null);
  const callbacksRef = useRef({ onPlay, onPause, onEnded, onTimeUpdate });

  // Keep callbacks ref up to date without re-subscribing events
  useEffect(() => {
    callbacksRef.current = { onPlay, onPause, onEnded, onTimeUpdate };
  }, [onPlay, onPause, onEnded, onTimeUpdate]);

  const onReady = useCallback((plyr: { on: (event: string, cb: () => void) => void; currentTime: number }) => {
    if (!plyr) return;
    plyr.on('play', () => callbacksRef.current.onPlay());
    plyr.on('pause', () => callbacksRef.current.onPause());
    plyr.on('ended', () => callbacksRef.current.onEnded());
    plyr.on('timeupdate', () => callbacksRef.current.onTimeUpdate(plyr.currentTime));
  }, []);

  useEffect(() => {
    const plyr = plyrRef.current?.plyr;
    if (plyr) onReady(plyr);
  }, [onReady]);

  return (
    <Plyr
      ref={plyrRef}
      source={{
        type: 'video' as const,
        sources: [{ src, type: 'video/mp4' }],
        poster,
      }}
      options={{
        controls: [
          'play-large',
          'play',
          'progress',
          'current-time',
          'mute',
          'volume',
          'settings',
          'fullscreen',
        ],
      }}
    />
  );
}
