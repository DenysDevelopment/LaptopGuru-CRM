'use client';

import VideoPlayer from '@/components/landing/video-player';
import { useVideoTracker } from '@/components/landing/video-tracker';
import { useReEngagement } from '@/components/landing/use-re-engagement';
import {
	Cpu,
	HardDrive,
	Laptop,
	MemoryStick,
	Monitor,
	MonitorSmartphone,
} from 'lucide-react';
import { Nunito } from 'next/font/google';
import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useIsDesktop } from '@/hooks/use-is-desktop';

import { HIDDEN_TITLES, t, type Lang } from './landing-client.i18n';
import { parseSpecs, simpleHash } from './landing-client.utils';
import { SpecRow } from './spec-row';

const nunito = Nunito({
	weight: ['400', '600', '700', '800'],
	subsets: ['latin', 'latin-ext', 'cyrillic'],
});
interface Props {
	landing: {
		id: string;
		slug: string;
		title: string;
		productUrl: string;
		buyButtonText: string;
		personalNote: string | null;
		customerName: string | null;
		productName: string | null;
		language: Lang;
		type: string;
		/** true when the server determined this visit shouldn't be tracked. */
		trackingExcluded: boolean;
		/** Raw ?preview=<token> value from the URL, forwarded to the API. */
		previewToken: string | null;
	};
	video: {
		id: string;
		source: string;
		status: string;
		youtubeId: string | null;
		videoUrl: string | null;
		thumbnail: string;
		title: string;
		durationSeconds: number | null;
	};
}
export function LandingClient({ landing, video }: Props) {
	const lang = landing.language;
	const tr = t[lang] || t.pl;
	const specs = parseSpecs(landing.productName) || parseSpecs(video.title);

	const visitIdRef = useRef<string | null>(null);
	const visitIdPromise = useRef<{
		resolve: (id: string) => void;
		promise: Promise<string>;
	}>(null);
	const startTimeRef = useRef<number>(null);
	const maxScrollRef = useRef(0);
	const clickCountRef = useRef(0);
	const tabSwitchesRef = useRef(0);
	const videoPlayedRef = useRef(false);
	const videoWatchStartRef = useRef<number | null>(null);
	const videoWatchAccumRef = useRef(0);
	const videoCompletedRef = useRef(false);
	const firstPlayTimeRef = useRef<number | null>(null);
	const lastYouTubeStateRef = useRef<number | null>(null);

	// Create a promise that resolves when visitId is ready
	if (visitIdPromise.current == null) {
		let resolve: (id: string) => void;
		const promise = new Promise<string>(r => {
			resolve = r;
		});
		visitIdPromise.current = { resolve: resolve!, promise };
	}

	const videoElRef = useRef<HTMLVideoElement | null>(null);

	const tracker = useVideoTracker({
		slug: landing.slug,
		visitIdRef,
		visitReady: visitIdPromise.current!.promise,
		videoId: video.id,
		videoSource: video.source as 'S3' | 'YOUTUBE',
		videoElementRef: videoElRef,
	});

	// Re-engagement: nudge viewers back if they switch tabs (cycling title +
	// favicon). Every return is recorded in the session trace via
	// tracker.onVisitorReturned so we can measure how often the nudge works.
	useReEngagement({
		hiddenTitles: HIDDEN_TITLES[landing.language] ?? HIDDEN_TITLES.pl,
		onReturn: ({ awayMs, modalShown }) => tracker.onVisitorReturned(awayMs, modalShown),
	});

	// PATCH engagement — waits for visitId if not ready. Becomes a no-op when
	// the server flagged this visit as excluded from tracking.
	const sendUpdate = useCallback(
		(data: Record<string, unknown>) => {
			if (landing.trackingExcluded) return;
			const doPatch = (visitId: string) => {
				fetch(`/api/landings/${landing.slug}/track`, {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ visitId, ...data }),
					keepalive: true,
				})
					.then(r => {
						if (!r.ok) console.warn('[track] PATCH failed:', r.status);
					})
					.catch(e => console.warn('[track] PATCH error:', e));
			};
			if (visitIdRef.current) {
				doPatch(visitIdRef.current);
			} else {
				visitIdPromise.current!.promise.then(doPatch);
			}
		},
		[landing.slug, landing.trackingExcluded],
	);

	// Initial visit registration — collect ABSOLUTELY EVERYTHING
	useEffect(() => {
		if (landing.trackingExcluded) return; // admin preview / allowlisted IP
		startTimeRef.current = Date.now();
		const sessionId = crypto.randomUUID();
		const urlParams = new URLSearchParams(window.location.search);
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const nav = navigator as any;
		const conn = (nav.connection ||
			nav.mozConnection ||
			nav.webkitConnection) as
			| {
					effectiveType?: string;
					downlink?: number;
					rtt?: number;
					saveData?: boolean;
					type?: string;
			  }
			| undefined;
		const mm = (q: string) => {
			try {
				return window.matchMedia?.(q).matches ?? null;
			} catch {
				return null;
			}
		};
		const s = (fn: () => unknown) => {
			try {
				return fn();
			} catch {
				return null;
			}
		};

		// --- GPU / WebGL ---
		let gpuRenderer: string | null = null,
			gpuVendor: string | null = null,
			webglHash: string | null = null;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const webglExtended: any = {};
		try {
			const c = document.createElement('canvas');
			const gl = (c.getContext('webgl') ||
				c.getContext('experimental-webgl')) as WebGLRenderingContext | null;
			if (gl) {
				const dbg = gl.getExtension('WEBGL_debug_renderer_info');
				if (dbg) {
					gpuRenderer = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || null;
					gpuVendor = gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) || null;
				}
				const glParams = [
					gl.getParameter(gl.VERSION),
					gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
					gl.getParameter(gl.MAX_TEXTURE_SIZE),
					gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),
					gpuRenderer,
					gpuVendor,
				];
				webglHash = simpleHash(glParams.join('|'));
				webglExtended.version = gl.getParameter(gl.VERSION);
				webglExtended.shadingLang = gl.getParameter(
					gl.SHADING_LANGUAGE_VERSION,
				);
				webglExtended.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
				webglExtended.maxRenderBufferSize = gl.getParameter(
					gl.MAX_RENDERBUFFER_SIZE,
				);
				webglExtended.maxViewportDims = Array.from(
					gl.getParameter(gl.MAX_VIEWPORT_DIMS) || [],
				);
				webglExtended.maxVertexAttribs = gl.getParameter(gl.MAX_VERTEX_ATTRIBS);
				webglExtended.maxVaryingVectors = gl.getParameter(
					gl.MAX_VARYING_VECTORS,
				);
				webglExtended.maxVertexUniformVectors = gl.getParameter(
					gl.MAX_VERTEX_UNIFORM_VECTORS,
				);
				webglExtended.maxFragmentUniformVectors = gl.getParameter(
					gl.MAX_FRAGMENT_UNIFORM_VECTORS,
				);
				webglExtended.aliasedLineWidthRange = Array.from(
					gl.getParameter(gl.ALIASED_LINE_WIDTH_RANGE) || [],
				);
				webglExtended.aliasedPointSizeRange = Array.from(
					gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE) || [],
				);
				webglExtended.extensions = gl.getSupportedExtensions();
				try {
					const hp = gl.getShaderPrecisionFormat(
						gl.FRAGMENT_SHADER,
						gl.HIGH_FLOAT,
					);
					webglExtended.shaderPrecision = hp
						? {
								rangeMin: hp.rangeMin,
								rangeMax: hp.rangeMax,
								precision: hp.precision,
							}
						: null;
				} catch {
					/* */
				}
			}
		} catch {
			/* */
		}

		// --- Canvas fingerprint ---
		let canvasHash: string | null = null;
		try {
			const c = document.createElement('canvas');
			c.width = 280;
			c.height = 60;
			const ctx = c.getContext('2d');
			if (ctx) {
				ctx.textBaseline = 'top';
				ctx.font = '14px Arial';
				ctx.fillStyle = '#f60';
				ctx.fillRect(125, 1, 62, 20);
				ctx.fillStyle = '#069';
				ctx.fillText('Cwm fjord bank', 2, 15);
				ctx.fillStyle = 'rgba(102,204,0,0.7)';
				ctx.fillText('glyphs vext quiz', 4, 37);
				ctx.arc(50, 50, 10, 0, Math.PI * 2);
				ctx.stroke();
				canvasHash = simpleHash(c.toDataURL());
			}
		} catch {
			/* */
		}

		// --- Audio fingerprint ---
		let audioHash: string | null = null;
		try {
			const AC =
				window.AudioContext ||
				(window as unknown as { webkitAudioContext: typeof AudioContext })
					.webkitAudioContext;
			if (AC) {
				const ctx = new AC();
				const osc = ctx.createOscillator();
				const an = ctx.createAnalyser();
				const g = ctx.createGain();
				g.gain.value = 0;
				osc.type = 'triangle';
				osc.connect(an);
				an.connect(g);
				g.connect(ctx.destination);
				osc.start(0);
				const d = new Float32Array(an.frequencyBinCount);
				an.getFloatFrequencyData(d);
				audioHash = simpleHash(Array.from(d.slice(0, 30)).join(','));
				osc.stop();
				ctx.close();
			}
		} catch {
			/* */
		}

		// --- Ad blocker ---
		let adBlocker: boolean | null = null;
		try {
			const ad = document.createElement('div');
			ad.innerHTML = '&nbsp;';
			ad.className = 'adsbox ad-banner textads';
			ad.style.cssText =
				'position:absolute;left:-9999px;top:-9999px;width:1px;height:1px';
			document.body.appendChild(ad);
			adBlocker = ad.offsetHeight === 0;
			document.body.removeChild(ad);
		} catch {
			/* */
		}

		// --- DOMRect fingerprint ---
		let domRectHash: string | null = null;
		try {
			const el = document.createElement('span');
			el.textContent = 'Fingerprint DOMRect Benchmark';
			el.style.cssText =
				'position:absolute;left:-9999px;font-size:16px;font-family:Arial,sans-serif';
			document.body.appendChild(el);
			const r = el.getBoundingClientRect();
			domRectHash = simpleHash(
				`${r.x},${r.y},${r.width},${r.height},${r.top},${r.right},${r.bottom},${r.left}`,
			);
			document.body.removeChild(el);
		} catch {
			/* */
		}

		// --- Emoji rendering fingerprint ---
		let emojiHash: string | null = null;
		try {
			const c = document.createElement('canvas');
			c.width = 200;
			c.height = 30;
			const ctx = c.getContext('2d');
			if (ctx) {
				ctx.font = '20px serif';
				ctx.fillText('🏴‍☠️🦊🌈🔥💎', 0, 22);
				emojiHash = simpleHash(c.toDataURL());
			}
		} catch {
			/* */
		}

		// --- Math fingerprint ---
		const mathFingerprint = s(() =>
			simpleHash(
				[
					Math.tan(-1e300),
					Math.sinh(1),
					Math.cosh(1),
					Math.tanh(1),
					Math.expm1(1),
					Math.log1p(1),
					Math.cbrt(2),
					Math.log2(3),
				].join(','),
			),
		);

		// --- Installed fonts (fast) ---
		const detectedFonts = s(() => {
			const testFonts = [
				'Nunito',
				'Arial',
				'Verdana',
				'Times New Roman',
				'Courier New',
				'Georgia',
				'Palatino',
				'Garamond',
				'Comic Sans MS',
				'Impact',
				'Lucida Console',
				'Tahoma',
				'Trebuchet MS',
				'Helvetica',
				'Futura',
				'Calibri',
				'Cambria',
				'Consolas',
				'Segoe UI',
				'Roboto',
				'Open Sans',
				'Montserrat',
				'Lato',
				'Source Code Pro',
				'Fira Code',
				'Ubuntu',
				'Cantarell',
				'SF Pro',
				'Apple Color Emoji',
			];
			const c = document.createElement('canvas');
			const ctx = c.getContext('2d');
			if (!ctx) return [];
			const baseline = 'mmmmmmmmmmlli';
			ctx.font = '72px monospace';
			const defaultWidth = ctx.measureText(baseline).width;
			ctx.font = '72px serif';
			const serifWidth = ctx.measureText(baseline).width;
			return testFonts.filter(f => {
				ctx.font = `72px "${f}",monospace`;
				const w1 = ctx.measureText(baseline).width;
				ctx.font = `72px "${f}",serif`;
				const w2 = ctx.measureText(baseline).width;
				return w1 !== defaultWidth || w2 !== serifWidth;
			});
		});

		// --- Permissions ---
		const permissionsPromise = (async () => {
			if (!navigator.permissions?.query) return null;
			const perms: Record<string, string> = {};
			for (const name of [
				'camera',
				'microphone',
				'notifications',
				'geolocation',
				'persistent-storage',
				'push',
			]) {
				try {
					const r = await navigator.permissions.query({
						name: name as PermissionName,
					});
					perms[name] = r.state;
				} catch {
					/* */
				}
			}
			return perms;
		})();

		// --- Speech voices ---
		const voicesPromise = new Promise<string[] | null>(resolve => {
			try {
				const voices = speechSynthesis?.getVoices();
				if (voices?.length) {
					resolve(voices.map(v => v.name));
					return;
				}
				speechSynthesis?.addEventListener(
					'voiceschanged',
					() => {
						resolve(speechSynthesis.getVoices().map(v => v.name));
					},
					{ once: true },
				);
				setTimeout(() => resolve(null), 2000);
			} catch {
				resolve(null);
			}
		});

		// --- Media devices ---
		const devicesPromise = (async () => {
			try {
				const devs = await navigator.mediaDevices?.enumerateDevices();
				if (!devs) return null;
				return {
					audioinput: devs.filter(d => d.kind === 'audioinput').length,
					audiooutput: devs.filter(d => d.kind === 'audiooutput').length,
					videoinput: devs.filter(d => d.kind === 'videoinput').length,
				};
			} catch {
				return null;
			}
		})();

		// --- Battery ---
		const batteryPromise = nav.getBattery
			? nav
					.getBattery()
					.then((b: { level: number; charging: boolean }) => ({
						batteryLevel: b.level,
						batteryCharging: b.charging,
					}))
					.catch(() => ({ batteryLevel: null, batteryCharging: null }))
			: Promise.resolve({ batteryLevel: null, batteryCharging: null });

		// --- Storage ---
		const storagePromise = nav.storage?.estimate
			? nav.storage
					.estimate()
					.then((e: { quota?: number; usage?: number }) => ({
						quotaMB: e.quota ? Math.round(e.quota / 1024 / 1024) : null,
						usageMB: e.usage ? Math.round(e.usage / 1024 / 1024) : null,
					}))
					.catch(() => null)
			: Promise.resolve(null);

		// --- Collect all async data ---
		Promise.all([
			batteryPromise,
			storagePromise,
			permissionsPromise,
			voicesPromise,
			devicesPromise,
		]).then(([battery, storage, permissions, voices, mediaDevices]) => {
			// --- Extended data (JSON blob) ---
			const extendedData = {
				// Screen extended
				colorDepth: screen.colorDepth,
				pixelDepth: screen.pixelDepth,
				availWidth: screen.availWidth,
				availHeight: screen.availHeight,
				outerWidth: window.outerWidth,
				outerHeight: window.outerHeight,
				screenX: window.screenX,
				screenY: window.screenY,
				orientation: s(() => ({
					type: screen.orientation?.type,
					angle: screen.orientation?.angle,
				})),

				// Intl
				intl: s(() => {
					const dtf = Intl.DateTimeFormat().resolvedOptions();
					return {
						timeZone: dtf.timeZone,
						locale: dtf.locale,
						calendar: dtf.calendar,
						numberingSystem: dtf.numberingSystem,
					};
				}),
				timezoneOffset: new Date().getTimezoneOffset(),

				// Navigator extended
				webdriver: nav.webdriver ?? null,
				onLine: nav.onLine,
				pluginsCount: nav.plugins?.length ?? 0,
				mimeTypesCount: nav.mimeTypes?.length ?? 0,
				pdfViewerEnabled: nav.pdfViewerEnabled ?? null,
				appVersion: nav.appVersion?.slice(0, 200),
				appCodeName: nav.appCodeName,
				userAgentData: s(() =>
					nav.userAgentData
						? {
								brands: nav.userAgentData.brands,
								mobile: nav.userAgentData.mobile,
								platform: nav.userAgentData.platform,
							}
						: null,
				),

				// CSS Media Queries
				media: {
					prefersColorScheme: mm('(prefers-color-scheme: dark)')
						? 'dark'
						: 'light',
					prefersReducedMotion: mm('(prefers-reduced-motion: reduce)'),
					prefersContrast: mm('(prefers-contrast: more)')
						? 'more'
						: mm('(prefers-contrast: less)')
							? 'less'
							: 'no-preference',
					prefersReducedTransparency: mm(
						'(prefers-reduced-transparency: reduce)',
					),
					forcedColors: mm('(forced-colors: active)'),
					invertedColors: mm('(inverted-colors: inverted)'),
					colorGamut: mm('(color-gamut: rec2020)')
						? 'rec2020'
						: mm('(color-gamut: p3)')
							? 'p3'
							: 'srgb',
					dynamicRange: mm('(dynamic-range: high)') ? 'high' : 'standard',
					pointer: mm('(pointer: fine)')
						? 'fine'
						: mm('(pointer: coarse)')
							? 'coarse'
							: 'none',
					anyPointer: mm('(any-pointer: fine)')
						? 'fine'
						: mm('(any-pointer: coarse)')
							? 'coarse'
							: 'none',
					hover: mm('(hover: hover)'),
					anyHover: mm('(any-hover: hover)'),
					displayMode: mm('(display-mode: standalone)')
						? 'standalone'
						: mm('(display-mode: fullscreen)')
							? 'fullscreen'
							: 'browser',
					monochrome: mm('(monochrome)'),
				},

				// Connection extended
				connectionFull: conn
					? {
							effectiveType: conn.effectiveType,
							downlink: conn.downlink,
							rtt: conn.rtt,
							saveData: conn.saveData,
							type: (conn as { type?: string }).type,
						}
					: null,

				// Math fingerprint
				mathFingerprint,

				// DOMRect fingerprint
				domRectHash,

				// Emoji rendering fingerprint
				emojiHash,

				// WebGL extended
				webgl: webglExtended,

				// Fonts
				detectedFonts,

				// Permissions
				permissions,

				// Speech voices count
				voicesCount: voices?.length ?? 0,

				// Media devices
				mediaDevices,

				// Performance memory (Chrome)
				memory: s(() => {
					const m = (
						performance as {
							memory?: {
								jsHeapSizeLimit: number;
								totalJSHeapSize: number;
								usedJSHeapSize: number;
							};
						}
					).memory;
					return m
						? {
								heapLimit: Math.round(m.jsHeapSizeLimit / 1024 / 1024),
								heapTotal: Math.round(m.totalJSHeapSize / 1024 / 1024),
								heapUsed: Math.round(m.usedJSHeapSize / 1024 / 1024),
							}
						: null;
				}),

				// Storage
				storage,

				// Feature detection
				features: {
					bluetooth: 'bluetooth' in navigator,
					gpu: 'gpu' in navigator,
					serial: 'serial' in navigator,
					usb: 'usb' in navigator,
					hid: 'hid' in navigator,
					xr: 'xr' in navigator,
					scheduling: 'scheduling' in navigator,
					sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
					offscreenCanvas: typeof OffscreenCanvas !== 'undefined',
					webAssembly: typeof WebAssembly !== 'undefined',
					serviceWorker: 'serviceWorker' in navigator,
					webRTC: typeof RTCPeerConnection !== 'undefined',
					webGL2: !!document.createElement('canvas').getContext('webgl2'),
					indexedDB: typeof indexedDB !== 'undefined',
					webSocket: typeof WebSocket !== 'undefined',
					webTransport:
						typeof (window as unknown as { WebTransport?: unknown })
							.WebTransport !== 'undefined',
					intersectionObserver: typeof IntersectionObserver !== 'undefined',
					resizeObserver: typeof ResizeObserver !== 'undefined',
					mutationObserver: typeof MutationObserver !== 'undefined',
					performanceObserver: typeof PerformanceObserver !== 'undefined',
				},

				// Ad blocker
				adBlocker,
			};

			fetch(`/api/landings/${landing.slug}/track`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					sessionId,
					screenWidth: screen.width,
					screenHeight: screen.height,
					viewportWidth: window.innerWidth,
					viewportHeight: window.innerHeight,
					pixelRatio: window.devicePixelRatio,
					touchSupport:
						'ontouchstart' in window || navigator.maxTouchPoints > 0,
					maxTouchPoints: navigator.maxTouchPoints || 0,
					cpuCores: nav.hardwareConcurrency || null,
					deviceMemory: nav.deviceMemory || null,
					gpuRenderer,
					gpuVendor,
					...battery,
					darkMode: mm('(prefers-color-scheme: dark)'),
					reducedMotion: mm('(prefers-reduced-motion: reduce)'),
					cookiesEnabled: navigator.cookieEnabled,
					doNotTrack: navigator.doNotTrack === '1',
					adBlocker,
					pdfSupport: nav.pdfViewerEnabled ?? null,
					storageQuota: storage?.quotaMB ?? null,
					downlink: conn?.downlink ?? null,
					rtt: conn?.rtt ?? null,
					saveData: conn?.saveData ?? null,
					referrer: document.referrer || null,
					utmSource: urlParams.get('utm_source'),
					utmMedium: urlParams.get('utm_medium'),
					utmCampaign: urlParams.get('utm_campaign'),
					utmTerm: urlParams.get('utm_term'),
					utmContent: urlParams.get('utm_content'),
					browserLang: navigator.language,
					browserLangs: nav.languages?.join(', ') || null,
					platform: navigator.platform,
					vendor: navigator.vendor || null,
					connectionType: conn?.effectiveType || null,
					canvasHash,
					webglHash,
					audioHash,
					extendedData,
				}),
			})
				.then(r => {
					if (!r.ok) throw new Error(`HTTP ${r.status}`);
					return r.json();
				})
				.then(d => {
					visitIdRef.current = d.visitId;
					visitIdPromise.current!.resolve(d.visitId);
				})
				.catch(e => {
					console.warn('[track] Initial POST failed, retrying...', e);
					// Retry with minimal payload
					setTimeout(() => {
						fetch(`/api/landings/${landing.slug}/track`, {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({ sessionId }),
						})
							.then(r => r.json())
							.then(d => {
								visitIdRef.current = d.visitId;
								visitIdPromise.current!.resolve(d.visitId);
							})
							.catch(e2 => console.error('[track] Retry also failed:', e2));
					}, 1000);
				});
		});
	}, [landing.slug, landing.trackingExcluded]);

	// Scroll tracking
	useEffect(() => {
		function onScroll() {
			const scrollTop = window.scrollY;
			const docHeight =
				document.documentElement.scrollHeight - window.innerHeight;
			if (docHeight > 0) {
				const pct = Math.round((scrollTop / docHeight) * 100);
				if (pct > maxScrollRef.current) maxScrollRef.current = pct;
			}
		}
		window.addEventListener('scroll', onScroll, { passive: true });
		return () => window.removeEventListener('scroll', onScroll);
	}, []);

	// Click tracking
	useEffect(() => {
		function onClick() {
			clickCountRef.current++;
		}
		document.addEventListener('click', onClick);
		return () => document.removeEventListener('click', onClick);
	}, []);

	// Tab visibility tracking
	useEffect(() => {
		function onVisibility() {
			if (document.hidden) tabSwitchesRef.current++;
		}
		document.addEventListener('visibilitychange', onVisibility);
		return () => document.removeEventListener('visibilitychange', onVisibility);
	}, []);

	// YouTube iframe API — video tracking via postMessage (only for YouTube videos)
	useEffect(() => {
		if (video.source !== 'YOUTUBE') return;
		const iframeEl = document.getElementById(
			'yt-player',
		) as HTMLIFrameElement | null;
		if (!iframeEl) return;
		const iframe = iframeEl; // non-null for closures

		let listeningActive = false;

		function onMessage(e: MessageEvent) {
			// YouTube sends both string and object messages
			let data: {
				event?: string;
				info?: { playerState?: number };
				channel?: string;
			} | null = null;
			try {
				data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
			} catch {
				return;
			}
			if (!data) return;

			// When YouTube confirms it's listening, subscribe to state changes
			if (
				data.event === 'onReady' ||
				(data.event === 'initialDelivery' && !listeningActive)
			) {
				listeningActive = true;
				iframe.contentWindow?.postMessage(
					JSON.stringify({
						event: 'command',
						func: 'addEventListener',
						args: ['onStateChange'],
					}),
					'*',
				);
			}

			// Track state changes: -1=unstarted, 0=ended, 1=playing, 2=paused, 3=buffering
			if (
				data.event === 'infoDelivery' &&
				data.info &&
				data.info.playerState !== undefined
			) {
				const state = data.info.playerState;
				if (state === lastYouTubeStateRef.current) return;
				lastYouTubeStateRef.current = state;
				if (state === 1) {
					// playing
					videoPlayedRef.current = true;
					if (!videoWatchStartRef.current)
						videoWatchStartRef.current = Date.now();
					tracker.onPlay();
					sendUpdate({ videoPlayed: true });
				}
				if (state === 2) {
					// paused
					if (videoWatchStartRef.current) {
						videoWatchAccumRef.current += Math.round(
							(Date.now() - videoWatchStartRef.current) / 1000,
						);
						videoWatchStartRef.current = null;
					}
					tracker.onPause();
				}
				if (state === 0) {
					// ended
					if (videoWatchStartRef.current) {
						videoWatchAccumRef.current += Math.round(
							(Date.now() - videoWatchStartRef.current) / 1000,
						);
						videoWatchStartRef.current = null;
					}
					videoCompletedRef.current = true;
					tracker.onEnded();
				}
				if (state === 3) {
					// buffering
					tracker.onBufferStart();
				}
			}

			// Also detect via "onStateChange" event directly
			if (data.event === 'onStateChange' && data.info !== undefined) {
				const state =
					typeof data.info === 'number'
						? data.info
						: (data.info as { playerState?: number })?.playerState;
				if (state === lastYouTubeStateRef.current) return;
				lastYouTubeStateRef.current = state ?? null;
				if (state === 1) {
					videoPlayedRef.current = true;
					if (!videoWatchStartRef.current)
						videoWatchStartRef.current = Date.now();
					tracker.onPlay();
					sendUpdate({ videoPlayed: true });
				}
				if (state === 2) {
					if (videoWatchStartRef.current) {
						videoWatchAccumRef.current += Math.round(
							(Date.now() - videoWatchStartRef.current) / 1000,
						);
						videoWatchStartRef.current = null;
					}
					tracker.onPause();
				}
				if (state === 0) {
					if (videoWatchStartRef.current) {
						videoWatchAccumRef.current += Math.round(
							(Date.now() - videoWatchStartRef.current) / 1000,
						);
						videoWatchStartRef.current = null;
					}
					videoCompletedRef.current = true;
					tracker.onEnded();
				}
				if (state === 3) {
					tracker.onBufferStart();
				}
			}
		}

		window.addEventListener('message', onMessage);

		// Keep telling YouTube we're listening (it needs periodic pings)
		const timer = setInterval(() => {
			if (iframe.contentWindow) {
				iframe.contentWindow.postMessage(
					JSON.stringify({ event: 'listening' }),
					'*',
				);
			}
		}, 500);

		// Also try IntersectionObserver — if user scrolled to video, count as "interest"
		const observer = new IntersectionObserver(
			entries => {
				entries.forEach(entry => {
					if (entry.isIntersecting && entry.intersectionRatio > 0.5) {
						// User can see the video — YouTube tracking handles the rest
					}
				});
			},
			{ threshold: 0.5 },
		);
		observer.observe(iframe);

		return () => {
			clearInterval(timer);
			window.removeEventListener('message', onMessage);
			observer.disconnect();
		};
		// tracker/sendUpdate are closures that read from refs; pinning to video.source
		// avoids tearing down the iframe listener on each render.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [video.source]);

	// Periodic engagement updates + final update on unload
	useEffect(() => {
		function buildEngagement() {
			// Accumulate video time if still playing
			let videoTime = videoWatchAccumRef.current;
			if (videoWatchStartRef.current) {
				videoTime += Math.round(
					(Date.now() - videoWatchStartRef.current) / 1000,
				);
			}
			// Collect dropped frames if available
			let droppedFrames: number | undefined;
			try {
				const vid = document.querySelector('video');
				if (vid) {
					const q = vid.getVideoPlaybackQuality?.();
					if (q) droppedFrames = q.droppedVideoFrames;
				}
			} catch {
				/* not supported */
			}

			return {
				timeOnPage: Math.round(
					(Date.now() - (startTimeRef.current ?? Date.now())) / 1000,
				),
				maxScrollDepth: maxScrollRef.current,
				totalClicks: clickCountRef.current,
				tabSwitches: tabSwitchesRef.current,
				videoPlayed: videoPlayedRef.current,
				videoWatchTime: videoTime,
				videoCompleted: videoCompletedRef.current,
				pageVisible: !document.hidden,
				...(firstPlayTimeRef.current != null && {
					videoTimeToPlay: firstPlayTimeRef.current,
				}),
				...(droppedFrames != null && { videoDroppedFrames: droppedFrames }),
			};
		}

		// First update after 5 seconds, then every 10 seconds
		const firstTimeout = setTimeout(() => {
			sendUpdate(buildEngagement());
		}, 5000);
		const interval = setInterval(() => {
			sendUpdate(buildEngagement());
		}, 10000);

		// On unload — final send. pagehide is the only reliable signal on iOS Safari
		// (beforeunload often doesn't fire on swipe-close), so we listen for both.
		function onUnload() {
			sendUpdate(buildEngagement());
		}
		window.addEventListener('beforeunload', onUnload);
		window.addEventListener('pagehide', onUnload);
		const onVisChange = () => {
			if (document.hidden) {
				sendUpdate(buildEngagement());
			}
		};
		document.addEventListener('visibilitychange', onVisChange);

		return () => {
			clearTimeout(firstTimeout);
			clearInterval(interval);
			window.removeEventListener('beforeunload', onUnload);
			window.removeEventListener('pagehide', onUnload);
			document.removeEventListener('visibilitychange', onVisChange);
		};
	}, [sendUpdate]);

	// Scroll-reveal animations via IntersectionObserver
	const [showCta, setShowCta] = useState(false);
	const [isVideoPlaying, setIsVideoPlaying] = useState(false);
	// Mobile hides the CTA during playback so the video stays unobstructed.
	// Desktop has a separate layout where the CTA doesn't overlap the video,
	// so we keep it visible there regardless of play state.
	const isDesktop = useIsDesktop();
	useEffect(() => {
		const timer = setTimeout(() => {
			const els = document.querySelectorAll('[data-animate]');
			const observer = new IntersectionObserver(
				entries => {
					entries.forEach(entry => {
						if (entry.isIntersecting) {
							(entry.target as HTMLElement).classList.add('anim-visible');
							observer.unobserve(entry.target);
						}
					});
				},
				{ threshold: 0.05, rootMargin: '0px 0px 50px 0px' },
			);
			els.forEach(el => {
				// Elements already in viewport — animate immediately
				const rect = el.getBoundingClientRect();
				if (rect.top < window.innerHeight && rect.bottom > 0) {
					(el as HTMLElement).classList.add('anim-visible');
				} else {
					observer.observe(el);
				}
			});
		}, 100);

		// Show fixed CTA with delay
		const ctaTimer = setTimeout(() => setShowCta(true), 800);

		return () => {
			clearTimeout(timer);
			clearTimeout(ctaTimer);
		};
	}, []);

	function handleBuyClick() {
		sendUpdate({
			buyButtonClicked: true,
			timeOnPage: Math.round(
				(Date.now() - (startTimeRef.current ?? Date.now())) / 1000,
			),
		});
		// Existing Allegro landings created before the seller-shop fallback
		// have an empty productUrl; send those buyers to allegro.pl so the
		// click does something useful instead of navigating to "".
		const target =
			landing.productUrl ||
			(landing.type === 'allegro' ? 'https://allegro.pl' : '');
		fetch(`/api/landings/${landing.slug}/click`, { method: 'POST' }).finally(
			() => {
				if (target) window.location.href = target;
			},
		);
	}

	return (
		<div
			className={`min-h-screen bg-[#f5f5f5] flex flex-col ${nunito.className}`}
			style={
				{
					margin: 0,
					padding: 0,
					// Published at the root so every descendant sees it — both the
					// mobile bottom-spacer (pb-[var(--cta-h)]) a few levels up and the
					// video height calc a few levels down rely on the same value.
					'--cta-h':
						'calc(85px + max(env(safe-area-inset-bottom, 0px), 12px))',
					'--header-h': '86px',
				} as React.CSSProperties
			}>
			{/* Animation styles */}
			<style
				dangerouslySetInnerHTML={{
					__html: `
        [data-animate] {
          opacity: 0;
          transform: translateY(24px);
          transition: opacity 0.7s cubic-bezier(0.16,1,0.3,1), transform 0.7s cubic-bezier(0.16,1,0.3,1);
        }
        [data-animate].anim-visible {
          opacity: 1;
          transform: translateY(0);
        }
        [data-animate-delay="1"] { transition-delay: 0.1s; }
        [data-animate-delay="2"] { transition-delay: 0.2s; }
        [data-animate-delay="3"] { transition-delay: 0.3s; }
        [data-animate-delay="4"] { transition-delay: 0.15s; }
        [data-animate-delay="5"] { transition-delay: 0.3s; }
        [data-animate-delay="6"] { transition-delay: 0.45s; }

        @keyframes slideUp {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes ctaPulse {
          0%, 100% { box-shadow: 0 4px 20px rgba(251,120,48,0.4); }
          50% { box-shadow: 0 4px 32px rgba(251,120,48,0.65); }
        }
        .anim-slide-up {
          animation: slideUp 0.5s cubic-bezier(0.16,1,0.3,1) forwards;
        }
        .anim-cta-pulse {
          animation: ctaPulse 2.5s ease-in-out infinite;
        }

        @keyframes headerShine {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        .header-shine {
          background-size: 200% auto;
          animation: headerShine 3s linear infinite;
        }

        @keyframes wave {
          0%, 100% { transform: rotate(0deg); }
          25% { transform: rotate(20deg); }
          50% { transform: rotate(-10deg); }
          75% { transform: rotate(15deg); }
        }

        @keyframes borderGlow {
          0%   { box-shadow: 0 0 8px 2px rgba(251,120,48,0.5), 0 0 20px 4px rgba(245,158,11,0.3); }
          33%  { box-shadow: 0 0 12px 4px rgba(245,158,11,0.6), 0 0 28px 8px rgba(251,120,48,0.35); }
          66%  { box-shadow: 0 0 8px 2px rgba(255,255,255,0.4), 0 0 24px 6px rgba(251,120,48,0.4); }
          100% { box-shadow: 0 0 8px 2px rgba(251,120,48,0.5), 0 0 20px 4px rgba(245,158,11,0.3); }
        }
        .anim-border-glow {
          animation: borderGlow 2s ease-in-out infinite;
          border: 2px solid rgba(245,158,11,0.6);
        }

        @keyframes iconFloat {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
        @keyframes iconBounce {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.08); }
        }
        .anim-icon-float {
          animation: iconFloat 3s ease-in-out infinite;
        }
        .anim-icon-bounce {
          animation: iconBounce 2s ease-in-out infinite;
        }
        .benefit-icon:nth-child(1) .anim-icon-float { animation-delay: 0s; }
        .benefit-icon:nth-child(2) .anim-icon-float { animation-delay: 0.4s; }
        .benefit-icon:nth-child(3) .anim-icon-float { animation-delay: 0.8s; }

        .spec-icon {
          transition: transform 0.3s ease;
        }
        .spec-icon:hover {
          transform: rotate(8deg) scale(1.15);
        }
      `,
				}}
			/>

			<div className='flex-1 pb-[var(--cta-h)] md:pb-28'>
				{/* Header — desktop only, orange gradient with logo */}
				<div
					className='hidden md:block py-1 px-6 text-center header-shine'
					style={{
						background:
							'linear-gradient(135deg, #fb7830 0%, #f59e0b 50%, #fb7830 100%)',
						backgroundSize: '200% auto',
					}}>
					<Image
						src='/LG_logo2.webp'
						alt='Laptop Guru'
						width={200}
						height={72}
						loading='lazy'
						className='mx-auto mb-1.5 w-auto'
						style={{ height: 72, filter: 'brightness(0) invert(1)' }}
					/>
				</div>

				{/* Video — fills viewport minus sticky CTA. Video element uses
				    object-cover so it crops to fit the viewport aspect instead of
				    showing letterbox bars. Mobile-only watermark sits in the
				    middle (desktop has the header logo above instead). */}
				<div className='w-full flex items-center justify-center md:py-6 md:mb-6'>
					<div className='relative w-full md:w-auto md:aspect-[9/16] overflow-hidden bg-black h-screen h-[100dvh] md:h-[calc(100vh-var(--cta-h)-var(--header-h)-3rem)] md:h-[calc(100dvh-var(--cta-h)-var(--header-h)-3rem)] md:rounded-2xl md:shadow-[0_8px_32px_rgba(0,0,0,0.15)]'>
						{/* Top header bar — hidden while playing */}
						<div
							className={`pointer-events-none absolute top-0 inset-x-0 z-20 shadow-[0_4px_16px_rgba(0,0,0,0.15)] ${
								isVideoPlaying ? 'opacity-0' : 'opacity-100'
							}`}>
							<div className='md:hidden bg-white px-4 py-1.5 flex items-center justify-center'>
								<Image
									src='/LG_logo2.webp'
									alt='Laptop Guru'
									width={200}
									height={72}
									loading='lazy'
									unoptimized
									className='w-auto h-14 sm:h-16'
								/>
							</div>
							<div className='bg-[#fb7830] px-4 py-3 flex items-center justify-center'>
								<span className='text-base sm:text-lg font-extrabold text-white tracking-tight'>
									Sprawdzamy Twój laptop
								</span>
							</div>
						</div>

						{/* Mobile watermark logo — visible only while playing */}
						<div
							className={`md:hidden pointer-events-none absolute top-3 inset-x-0 flex justify-center z-10 ${
								isVideoPlaying ? 'opacity-50' : 'opacity-0'
							}`}>
							<Image
								src='/LG_logo2.webp'
								alt=''
								width={120}
								height={43}
								loading='lazy'
								unoptimized
								className='w-auto h-20'
								style={{
									filter:
										'brightness(0) invert(1) drop-shadow(0 2px 4px rgba(0,0,0,0.7))',
								}}
							/>
						</div>

						{/* Model badge — benefit pill below the header */}
						<div
							className={`pointer-events-none absolute inset-x-3 z-20 flex justify-center top-[11rem] sm:top-[12rem] md:top-16 ${
								isVideoPlaying ? 'opacity-0' : 'opacity-100'
							}`}>
							<div className='mx-auto max-w-md rounded-2xl bg-white/70 backdrop-blur-md shadow-[0_8px_32px_rgba(0,0,0,0.25)] border border-white/50 px-4 py-2.5 sm:px-5 sm:py-3'>
								<p className='text-base sm:text-lg font-bold text-[#333] m-0 text-center leading-tight'>
									{video.title}
								</p>
							</div>
						</div>

						{video.status !== 'READY' ||
						(video.source === 'S3' && !video.videoUrl) ||
						(video.source === 'YOUTUBE' && !video.youtubeId) ? (
							<div className='absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-gray-900 to-gray-800 text-white px-6 text-center gap-3'>
								<div className='w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin' />
								<p className='text-lg font-semibold'>{tr.videoProcessingTitle}</p>
								<p className='text-sm text-white/70 max-w-xs'>
									{tr.videoProcessingDesc}
								</p>
							</div>
						) : video.source === 'S3' && video.videoUrl ? (
							<VideoPlayer
								src={video.videoUrl}
								poster='/poster.webp'
								onVideoElement={el => {
									videoElRef.current = el;
								}}
								onPlay={() => {
									videoPlayedRef.current = true;
									setIsVideoPlaying(true);
									if (!videoWatchStartRef.current)
										videoWatchStartRef.current = Date.now();
									if (firstPlayTimeRef.current == null) {
										firstPlayTimeRef.current =
											Date.now() - (startTimeRef.current ?? Date.now());
									}
									tracker.onPlay();
									sendUpdate({ videoPlayed: true });
								}}
								onPause={() => {
									setIsVideoPlaying(false);
									if (videoWatchStartRef.current) {
										videoWatchAccumRef.current += Math.round(
											(Date.now() - videoWatchStartRef.current) / 1000,
										);
										videoWatchStartRef.current = null;
									}
									tracker.onPause();
								}}
								onEnded={() => {
									videoCompletedRef.current = true;
									setIsVideoPlaying(false);
									if (videoWatchStartRef.current) {
										videoWatchAccumRef.current += Math.round(
											(Date.now() - videoWatchStartRef.current) / 1000,
										);
										videoWatchStartRef.current = null;
									}
									tracker.onEnded();
								}}
								onTimeUpdate={() => {
									// Tracker owns TICK generation on its own timer — nothing to do here.
								}}
								onSeeked={(seekFrom, seekTo) => {
									tracker.onSeek(
										Math.round(seekFrom * 1000),
										Math.round(seekTo * 1000),
									);
								}}
								onBufferStart={() => tracker.onBufferStart()}
								onBufferEnd={() => tracker.onBufferEnd(0)}
							/>
						) : video.youtubeId ? (
							<iframe
								id='yt-player'
								src={`https://www.youtube.com/embed/${video.youtubeId}?rel=0&enablejsapi=1`}
								title={video.title}
								allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture'
								allowFullScreen
								className='absolute inset-0 w-full h-full'
							/>
						) : null}

						{/* Benefits overlay — visible when paused (S3 player only) */}
						<div
							className={`pointer-events-none absolute inset-x-3 bottom-[calc(var(--cta-h,0px)+1rem)] md:bottom-8 z-20 ${
								video.source === 'S3' && !isVideoPlaying
									? 'opacity-100'
									: 'opacity-0'
							}`}>
							<div className='mx-auto max-w-md rounded-2xl bg-white/70 backdrop-blur-md shadow-[0_8px_32px_rgba(0,0,0,0.25)] border border-white/50 p-3 sm:p-4'>
								<div className='flex'>
									<div className='benefit-icon flex-1 text-center px-1'>
										<img
											src='https://www.laptopguru.pl/cdn/shop/files/gg2.png?v=1767364526&width=400'
											alt=''
											className='block mx-auto mb-1.5 h-8 sm:h-10'
										/>
										<p className='text-xs sm:text-sm font-bold text-[#333] m-0 leading-tight'>
											{tr.trustWarranty}
										</p>
									</div>
									<div className='benefit-icon flex-1 text-center px-1'>
										<img
											src='https://www.laptopguru.pl/cdn/shop/files/dd1.png?v=1767364860&width=400'
											alt=''
											className='block mx-auto mb-1.5 h-8 sm:h-10'
										/>
										<p className='text-xs sm:text-sm font-bold text-[#333] m-0 leading-tight'>
											{tr.trustDelivery}
										</p>
									</div>
									<div className='benefit-icon flex-1 text-center px-1'>
										<img
											src='https://www.laptopguru.pl/cdn/shop/files/vv1.png?v=1767365084&width=400'
											alt=''
											className='block mx-auto mb-1.5 h-8 sm:h-10'
										/>
										<p className='text-xs sm:text-sm font-bold text-[#333] m-0 leading-tight'>
											{tr.trustReturn}
										</p>
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>

				{/* Specs */}
				{specs && landing.type !== 'allegro' && (
					<div data-animate className='max-w-3xl mx-auto px-4 sm:px-6 mb-6'>
						<div className='bg-white rounded-2xl shadow-[0_4px_24px_rgba(0,0,0,0.08)] border border-gray-100 p-6'>
							<h2 className='text-lg font-bold text-gray-900 mb-4 flex items-center gap-2'>
								<svg
									className='w-5 h-5 text-[#fb7830]'
									fill='none'
									viewBox='0 0 24 24'
									stroke='currentColor'
									strokeWidth={2}>
									<path
										strokeLinecap='round'
										strokeLinejoin='round'
										d='M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25h-13.5A2.25 2.25 0 0 1 3 15V5.25m18 0A2.25 2.25 0 0 0 18.75 3H5.25A2.25 2.25 0 0 0 3 5.25m18 0V12a2.25 2.25 0 0 1-2.25 2.25h-13.5A2.25 2.25 0 0 1 3 12V5.25'
									/>
								</svg>
								{tr.specsTitle}
							</h2>
							<div className='grid grid-cols-1 sm:grid-cols-2 gap-3'>
								{specs.model && (
									<SpecRow
										icon={<Laptop className='w-5 h-5 text-[#fb7830]' />}
										label={tr.specModel}
										value={specs.model}
										delay={1}
									/>
								)}
								{specs.cpu && (
									<SpecRow
										icon={<Cpu className='w-5 h-5 text-[#fb7830]' />}
										label={tr.specCpu}
										value={specs.cpu}
										delay={2}
									/>
								)}
								{specs.ram && (
									<SpecRow
										icon={<MemoryStick className='w-5 h-5 text-[#fb7830]' />}
										label={tr.specRam}
										value={specs.ram}
										delay={3}
									/>
								)}
								{specs.storage && (
									<SpecRow
										icon={<HardDrive className='w-5 h-5 text-[#fb7830]' />}
										label={tr.specStorage}
										value={specs.storage}
										delay={4}
									/>
								)}
								{specs.gpu && (
									<SpecRow
										icon={<Monitor className='w-5 h-5 text-[#fb7830]' />}
										label={tr.specGpu}
										value={specs.gpu}
										delay={5}
									/>
								)}
								{specs.display && (
									<SpecRow
										icon={
											<MonitorSmartphone className='w-5 h-5 text-[#fb7830]' />
										}
										label={tr.specDisplay}
										value={specs.display}
										delay={6}
									/>
								)}
							</div>
						</div>
					</div>
				)}

				<div className='py-2 text-center'>
					<p className='text-xs mt-3 m-0' style={{ color: 'rgba(0,0,0,0.55)' }}>
						Developed with 💛 by{' '}
						<a
							href='https://denysmaksymuck.pl'
							target='_blank'
							rel='noopener noreferrer'
							className='text-[#fb7830] hover:underline'>
							Denys
						</a>
					</p>
				</div>
			</div>

			{(landing.productUrl || landing.type === 'allegro') && (
				<div
					className={`pointer-events-none fixed bottom-0 inset-x-0 z-[100] to-transparent pt-16 ${showCta && (isDesktop || !isVideoPlaying) ? 'anim-slide-up' : 'opacity-0 translate-y-full'}`}
					style={{
						paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 12px)',
						willChange: 'transform',
					}}>
					<div className='pointer-events-auto max-w-3xl mx-auto px-4 py-3'>
						<button
							onClick={handleBuyClick}
							style={{ backgroundColor: '#fb7830' }}
							className='cursor-pointer group relative w-full bg-gradient-to-r from-[#fb7830] to-[#e56a25] hover:from-[#e56a25] hover:to-[#d45a15] text-white py-4 rounded-xl text-lg font-bold anim-border-glow hover:shadow-[0_6px_28px_rgba(251,120,48,0.5)] transition-all active:scale-[0.98] overflow-hidden'>
							<span className='absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/20 to-transparent' />
							<span className='relative'>
								{landing.type === 'allegro'
									? tr.ctaButtonAllegro
									: tr.ctaButton}
							</span>
						</button>
					</div>
				</div>
			)}
		</div>
	);
}
