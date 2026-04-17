'use client';

import VideoPlayer from '@/components/landing/video-player';
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
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

const nunito = Nunito({
	weight: ['400', '600', '700', '800'],
	subsets: ['latin', 'latin-ext', 'cyrillic'],
});

// Simple hash for fingerprinting
function simpleHash(str: string): string {
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		const ch = str.charCodeAt(i);
		hash = (hash << 5) - hash + ch;
		hash |= 0;
	}
	return Math.abs(hash).toString(36);
}

type Lang = 'pl' | 'uk' | 'ru' | 'en' | 'lt' | 'et' | 'lv';

const t = {
	pl: {
		badge: 'Przygotowaliśmy coś specjalnie dla Ciebie',
		greeting: 'Cześć',
		greetingSuffix: 'mamy dla Ciebie coś wyjątkowego!',
		intro:
			'Nasz ekspert nagrał szczegółowy przegląd tego laptopa. Obejrzyj — zajmie tylko chwilę, a pomoże podjąć najlepszą decyzję.',
		benefit1Title: 'Recenzja eksperta',
		benefit1Desc: 'Nasi specjaliści szczegółowo sprawdzili ten produkt',
		benefit2Title: 'Uczciwe porównanie',
		benefit2Desc: 'Obiektywna ocena zalet i wad',
		benefit3Title: 'Najlepsza cena',
		benefit3Desc: 'Gwarantujemy najkorzystniejszą ofertę',
		ctaButton: 'Sprawdź ofertę',
		ctaButtonAllegro: 'Sprawdź ofertę na Allegro',
		ctaSub: 'Gwarancja 12 mies. · Darmowa dostawa · Zwrot 30 dni',
		trustWarranty: 'Gwarancja 12 miesięcy',
		trustDelivery: 'Darmowa dostawa pojutrze',
		trustReturn: 'Zwrot w ciągu 30 dni',
		ctaUrgency: 'Oferta ograniczona czasowo',
		ctaProof: 'osób ogląda teraz',
		ctaFree: 'Darmowa dostawa',
		copyright: 'Eksperckie recenzje laptopów',
		specsTitle: 'Specyfikacja',
		specModel: 'Model',
		specCpu: 'Procesor',
		specRam: 'Pamięć RAM',
		specStorage: 'Dysk',
		specGpu: 'Karta graficzna',
		specDisplay: 'Wyświetlacz',
	},
	uk: {
		badge: 'Ми підготували щось спеціально для вас',
		greeting: 'Привіт',
		greetingSuffix: 'ми підготували дещо особливе!',
		intro:
			'Наш експерт записав детальний огляд цього ноутбука. Подивіться — це займе лише хвилинку, але допоможе зробити найкращий вибір.',
		benefit1Title: 'Експертний огляд',
		benefit1Desc: 'Наші спеціалісти детально перевірили цей продукт',
		benefit2Title: 'Чесне порівняння',
		benefit2Desc: "Об'єктивна оцінка переваг та недоліків",
		benefit3Title: 'Найкраща ціна',
		benefit3Desc: 'Гарантуємо найвигіднішу пропозицію',
		ctaButton: 'Переглянути пропозицію',
		ctaButtonAllegro: 'Sprawdź ofertę na Allegro',
		ctaSub: 'Гарантія 12 міс. · Безкоштовна доставка · Повернення 30 днів',
		trustWarranty: 'Гарантія 12 місяців',
		trustDelivery: 'Безкоштовна доставка післязавтра',
		trustReturn: 'Повернення протягом 30 днів',
		ctaUrgency: 'Пропозиція обмежена в часі',
		ctaProof: 'осіб дивляться зараз',
		ctaFree: 'Безкоштовна доставка',
		copyright: 'Експертні огляди ноутбуків',
		specsTitle: 'Характеристики',
		specModel: 'Модель',
		specCpu: 'Процесор',
		specRam: "Оперативна пам'ять",
		specStorage: 'Накопичувач',
		specGpu: 'Відеокарта',
		specDisplay: 'Дисплей',
	},
	ru: {
		badge: 'Мы подготовили кое-что специально для вас',
		greeting: 'Привет',
		greetingSuffix: 'у нас есть кое-что особенное!',
		intro:
			'Наш эксперт записал подробный обзор этого ноутбука. Посмотрите — это займет пару минут, но поможет сделать лучший выбор.',
		benefit1Title: 'Экспертный обзор',
		benefit1Desc: 'Наши специалисты детально проверили этот продукт',
		benefit2Title: 'Честное сравнение',
		benefit2Desc: 'Объективная оценка достоинств и недостатков',
		benefit3Title: 'Лучшая цена',
		benefit3Desc: 'Гарантируем самое выгодное предложение',
		ctaButton: 'Смотреть предложение',
		ctaButtonAllegro: 'Sprawdź ofertę na Allegro',
		ctaSub: 'Гарантия 12 мес. · Бесплатная доставка · Возврат 30 дней',
		trustWarranty: 'Гарантия 12 месяцев',
		trustDelivery: 'Бесплатная доставка послезавтра',
		trustReturn: 'Возврат в течение 30 дней',
		ctaUrgency: 'Предложение ограничено по времени',
		ctaProof: 'чел. смотрят сейчас',
		ctaFree: 'Бесплатная доставка',
		copyright: 'Экспертные обзоры ноутбуков',
		specsTitle: 'Характеристики',
		specModel: 'Модель',
		specCpu: 'Процессор',
		specRam: 'Оперативная память',
		specStorage: 'Накопитель',
		specGpu: 'Видеокарта',
		specDisplay: 'Дисплей',
	},
	en: {
		badge: "We've prepared something special for you",
		greeting: 'Hey',
		greetingSuffix: "we've got something special for you!",
		intro:
			"Our expert recorded a detailed review of this laptop. Watch it — it'll only take a moment, but it'll help you make the best choice.",
		benefit1Title: 'Expert review',
		benefit1Desc: 'Our specialists have thoroughly tested this product',
		benefit2Title: 'Honest comparison',
		benefit2Desc: 'Objective assessment of pros and cons',
		benefit3Title: 'Best price',
		benefit3Desc: 'We guarantee the most competitive offer',
		ctaButton: 'View offer',
		ctaButtonAllegro: 'Sprawdź ofertę na Allegro',
		ctaSub: '12-month warranty · Free delivery · 30-day returns',
		trustWarranty: '12-month warranty',
		trustDelivery: 'Free delivery tomorrow',
		trustReturn: '30-day returns',
		ctaUrgency: 'Limited time offer',
		ctaProof: 'people viewing now',
		ctaFree: 'Free delivery',
		copyright: 'Expert laptop reviews',
		specsTitle: 'Specifications',
		specModel: 'Model',
		specCpu: 'Processor',
		specRam: 'RAM',
		specStorage: 'Storage',
		specGpu: 'Graphics',
		specDisplay: 'Display',
	},
	lt: {
		badge: 'Paruošėme kažką specialiai jums',
		greeting: 'Sveiki',
		greetingSuffix: 'turime jums kažką ypatingo!',
		intro:
			'Mūsų ekspertas įrašė išsamią šio nešiojamojo kompiuterio apžvalgą. Pažiūrėkite — tai užtruks tik akimirką, bet padės priimti geriausią sprendimą.',
		benefit1Title: 'Eksperto apžvalga',
		benefit1Desc: 'Mūsų specialistai išsamiai patikrino šį produktą',
		benefit2Title: 'Sąžiningas palyginimas',
		benefit2Desc: 'Objektyvus privalumų ir trūkumų įvertinimas',
		benefit3Title: 'Geriausia kaina',
		benefit3Desc: 'Garantuojame palankiausią pasiūlymą',
		ctaButton: 'Peržiūrėti pasiūlymą',
		ctaButtonAllegro: 'Sprawdź ofertę na Allegro',
		ctaSub:
			'12 mėn. garantija · Nemokamas pristatymas · Grąžinimas per 30 dienų',
		trustWarranty: '12 mėnesių garantija',
		trustDelivery: 'Nemokamas pristatymas poryt',
		trustReturn: 'Grąžinimas per 30 dienų',
		ctaUrgency: 'Riboto laiko pasiūlymas',
		ctaProof: 'žmonių žiūri dabar',
		ctaFree: 'Nemokamas pristatymas',
		copyright: 'Ekspertų nešiojamųjų kompiuterių apžvalgos',
		specsTitle: 'Specifikacijos',
		specModel: 'Modelis',
		specCpu: 'Procesorius',
		specRam: 'Operatyvioji atmintis',
		specStorage: 'Diskas',
		specGpu: 'Vaizdo plokštė',
		specDisplay: 'Ekranas',
	},
	et: {
		badge: 'Oleme teile midagi erilist ette valmistanud',
		greeting: 'Tere',
		greetingSuffix: 'meil on teile midagi erilist!',
		intro:
			'Meie ekspert salvestas selle sülearvuti üksikasjaliku ülevaate. Vaadake — see võtab vaid hetke, kuid aitab teha parima valiku.',
		benefit1Title: 'Eksperdi ülevaade',
		benefit1Desc: 'Meie spetsialistid on seda toodet põhjalikult testinud',
		benefit2Title: 'Aus võrdlus',
		benefit2Desc: 'Objektiivne plusside ja miinuste hinnang',
		benefit3Title: 'Parim hind',
		benefit3Desc: 'Garanteerime soodsaima pakkumise',
		ctaButton: 'Vaata pakkumist',
		ctaButtonAllegro: 'Sprawdź ofertę na Allegro',
		ctaSub: '12 kuu garantii · Tasuta kohaletoimetamine · 30 päeva tagastus',
		trustWarranty: '12 kuu garantii',
		trustDelivery: 'Tasuta kohaletoimetamine ülehomme',
		trustReturn: 'Tagastamine 30 päeva jooksul',
		ctaUrgency: 'Piiratud ajaga pakkumine',
		ctaProof: 'inimest vaatab praegu',
		ctaFree: 'Tasuta kohaletoimetamine',
		copyright: 'Ekspertide sülearvutite ülevaated',
		specsTitle: 'Tehnilised andmed',
		specModel: 'Mudel',
		specCpu: 'Protsessor',
		specRam: 'Muutmälu',
		specStorage: 'Kõvaketas',
		specGpu: 'Graafikakaart',
		specDisplay: 'Ekraan',
	},
	lv: {
		badge: 'Esam sagatavojuši kaut ko īpašu tieši jums',
		greeting: 'Sveiki',
		greetingSuffix: 'mums jums ir kaut kas īpašs!',
		intro:
			'Mūsu eksperts ierakstīja detalizētu šī klēpjdatora apskatu. Noskatieties — tas aizņems tikai brīdi, bet palīdzēs pieņemt labāko lēmumu.',
		benefit1Title: 'Eksperta apskats',
		benefit1Desc: 'Mūsu speciālisti ir rūpīgi pārbaudījuši šo produktu',
		benefit2Title: 'Godīgs salīdzinājums',
		benefit2Desc: 'Objektīvs priekšrocību un trūkumu novērtējums',
		benefit3Title: 'Labākā cena',
		benefit3Desc: 'Garantējam visizdevīgāko piedāvājumu',
		ctaButton: 'Skatīt piedāvājumu',
		ctaButtonAllegro: 'Sprawdź ofertę na Allegro',
		ctaSub:
			'12 mēnešu garantija · Bezmaksas piegāde · Atgriešana 30 dienu laikā',
		trustWarranty: '12 mēnešu garantija',
		trustDelivery: 'Bezmaksas piegāde parīt',
		trustReturn: 'Atgriešana 30 dienu laikā',
		ctaUrgency: 'Ierobežota laika piedāvājums',
		ctaProof: 'cilvēki skatās tagad',
		ctaFree: 'Bezmaksas piegāde',
		copyright: 'Ekspertu klēpjdatoru apskati',
		specsTitle: 'Specifikācijas',
		specModel: 'Modelis',
		specCpu: 'Procesors',
		specRam: 'Operatīvā atmiņa',
		specStorage: 'Disks',
		specGpu: 'Grafiskā karte',
		specDisplay: 'Displejs',
	},
};

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
	};
	video: {
		id: string;
		source: string;
		youtubeId: string | null;
		videoUrl: string | null;
		thumbnail: string;
		title: string;
		durationSeconds: number | null;
	};
}

// Parse product name like "Apple MacBook Pro A1990 (2019)/i7-8850H/32GB/512GB/Radeon Pro555x (4GB)/15.4"
function parseSpecs(productName: string | null) {
	if (!productName) return null;

	// Clean video title prefixes and hashtags/id suffixes
	const cleaned = productName
		.replace(/^(Wideorecenzja|Recenzja|Review)\s+/i, '')
		.replace(/\s+id:\d+.*$/i, '');

	const parts = cleaned.split('/').map(p => p.trim());
	if (parts.length < 3) return null;

	// If model part contains CPU info (e.g. "Dell Latitude 5500 i5-8gen"), split them
	const cpuPattern =
		/\b(i[3579]-?\w+|ryzen\s*\w+|m[12]\s*\w+|celeron\s*\w+|pentium\s*\w+|xeon\s*\w+|amd\s*\w+)/i;
	let model = parts[0] || null;
	let cpu = parts.find((p, i) => i > 0 && cpuPattern.test(p)) || null;

	if (!cpu && model && cpuPattern.test(model)) {
		const match = model.match(cpuPattern);
		if (match) {
			cpu = model.substring(match.index!).trim();
			model = model.substring(0, match.index!).trim();
		}
	}
	if (!cpu) cpu = parts.find(p => cpuPattern.test(p)) || null;
	const ram = parts.find(p => /^\d+\s*GB(\s*RAM)?$/i.test(p)) || null;
	const storage =
		parts.find(
			p => /^\d+\s*(GB|TB)(\s*SSD|\s*HDD|\s*NVMe)?$/i.test(p) && p !== ram,
		) || null;
	const gpu =
		parts.find(p =>
			/radeon|geforce|nvidia|gtx|rtx|intel\s*(hd|iris|uhd)|pro\s*\d{3}/i.test(
				p,
			),
		) || null;
	const display = parts.find(p => /^\d{1,2}(\.\d+)?(")?$/i.test(p)) || null;

	if (!model && !cpu && !ram) return null;

	return {
		model,
		cpu,
		ram,
		storage,
		gpu,
		display: display ? `${display}"` : null,
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
	const videoEventsBuffer = useRef<
		{
			clientEventId: string;
			eventType: string;
			position: number;
			seekFrom?: number;
			seekTo?: number;
			clientTimestamp: string;
		}[]
	>([]);
	const lastHeartbeatRef = useRef(0);
	const lastSentHeartbeatPos = useRef(-1);
	// Buffer/quality tracking
	const bufferStartRef = useRef<number | null>(null);
	const bufferCountRef = useRef(0);
	const bufferTotalMsRef = useRef(0);
	const firstPlayTimeRef = useRef<number | null>(null);

	// Create a promise that resolves when visitId is ready
	if (visitIdPromise.current == null) {
		let resolve: (id: string) => void;
		const promise = new Promise<string>(r => {
			resolve = r;
		});
		visitIdPromise.current = { resolve: resolve!, promise };
	}

	// POST video events — waits for visitId if not ready. On page hide / unload,
	// prefers navigator.sendBeacon (more reliable than fetch keepalive on Safari/Firefox).
	// Callers on the unload path pass { unload: true } because visibilityState may
	// still be 'visible' during beforeunload, which would otherwise skip sendBeacon.
	const postVideoEvents = useCallback(
		(events: typeof videoEventsBuffer.current, opts?: { unload?: boolean }) => {
			if (events.length === 0 || video.source !== 'S3') return;
			const url = `/api/landings/${landing.slug}/video-events`;
			const doPost = (visitId: string) => {
				const payload = JSON.stringify({
					videoId: video.id,
					landingVisitId: visitId,
					events,
				});
				const unloading =
					opts?.unload ||
					(typeof document !== 'undefined' &&
						document.visibilityState === 'hidden');
				if (
					unloading &&
					typeof navigator !== 'undefined' &&
					typeof navigator.sendBeacon === 'function'
				) {
					try {
						const blob = new Blob([payload], { type: 'application/json' });
						if (navigator.sendBeacon(url, blob)) return;
					} catch {
						// fall through to fetch
					}
				}
				fetch(url, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: payload,
					keepalive: true,
				})
					.then(r => {
						if (!r.ok) console.warn('[video-events] POST failed:', r.status);
					})
					.catch(e => console.warn('[video-events] POST error:', e));
			};
			if (visitIdRef.current) {
				doPost(visitIdRef.current);
			} else {
				visitIdPromise.current!.promise.then(doPost);
			}
		},
		[landing.slug, video.id, video.source],
	);

	// PATCH engagement — waits for visitId if not ready
	const sendUpdate = useCallback(
		(data: Record<string, unknown>) => {
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
		[landing.slug],
	);

	// Flush buffered heartbeats
	const flushVideoEvents = useCallback(
		(opts?: { unload?: boolean }) => {
			const events = videoEventsBuffer.current;
			if (events.length === 0) return;
			videoEventsBuffer.current = [];
			postVideoEvents(events, opts);
		},
		[postVideoEvents],
	);

	// Send a single event immediately
	const sendVideoEventNow = useCallback(
		(event: (typeof videoEventsBuffer.current)[0]) => {
			postVideoEvents([event]);
		},
		[postVideoEvents],
	);

	// Initial visit registration — collect ABSOLUTELY EVERYTHING
	useEffect(() => {
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
	}, [landing.slug]);

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
				if (state === 1) {
					// playing
					videoPlayedRef.current = true;
					if (!videoWatchStartRef.current)
						videoWatchStartRef.current = Date.now();
				}
				if (state === 0 || state === 2) {
					// ended or paused
					if (videoWatchStartRef.current) {
						videoWatchAccumRef.current += Math.round(
							(Date.now() - videoWatchStartRef.current) / 1000,
						);
						videoWatchStartRef.current = null;
					}
				}
			}

			// Also detect via "onStateChange" event directly
			if (data.event === 'onStateChange' && data.info !== undefined) {
				const state =
					typeof data.info === 'number'
						? data.info
						: (data.info as { playerState?: number })?.playerState;
				if (state === 1) {
					videoPlayedRef.current = true;
					if (!videoWatchStartRef.current)
						videoWatchStartRef.current = Date.now();
				}
				if (state === 0 || state === 2) {
					if (videoWatchStartRef.current) {
						videoWatchAccumRef.current += Math.round(
							(Date.now() - videoWatchStartRef.current) / 1000,
						);
						videoWatchStartRef.current = null;
					}
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
				...(bufferCountRef.current > 0 && {
					videoBufferCount: bufferCountRef.current,
					videoBufferTime: bufferTotalMsRef.current,
				}),
				...(droppedFrames != null && { videoDroppedFrames: droppedFrames }),
			};
		}

		// First update after 5 seconds, then every 10 seconds
		const firstTimeout = setTimeout(() => {
			sendUpdate(buildEngagement());
			flushVideoEvents();
		}, 5000);
		const interval = setInterval(() => {
			sendUpdate(buildEngagement());
			flushVideoEvents();
		}, 10000);

		// On unload — final send. pagehide is the only reliable signal on iOS Safari
		// (beforeunload often doesn't fire on swipe-close), so we listen for both.
		function onUnload() {
			sendUpdate(buildEngagement());
			flushVideoEvents({ unload: true });
		}
		window.addEventListener('beforeunload', onUnload);
		window.addEventListener('pagehide', onUnload);
		const onVisChange = () => {
			if (document.hidden) {
				sendUpdate(buildEngagement());
				flushVideoEvents({ unload: true });
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
	}, [sendUpdate, flushVideoEvents]);

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
		fetch(`/api/landings/${landing.slug}/click`, { method: 'POST' }).finally(
			() => {
				window.location.href = landing.productUrl;
			},
		);
	}

	return (
		<div
			className={`min-h-screen bg-[#f5f5f5] flex flex-col ${nunito.className}`}
			style={{ margin: 0, padding: 0 }}>
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
				<div
					className='w-full flex items-center justify-center md:py-6 md:mb-6'
					style={
						{
							'--cta-h':
								'calc(85px + max(env(safe-area-inset-bottom, 0px), 12px))',
							'--header-h': '86px',
						} as React.CSSProperties
					}>
					<div className='relative w-full md:w-auto md:aspect-[9/16] overflow-hidden bg-black h-[100dvh] md:h-[calc(100dvh-var(--cta-h)-var(--header-h)-3rem)] md:rounded-2xl md:shadow-[0_8px_32px_rgba(0,0,0,0.15)]'>
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

						{video.source === 'S3' && video.videoUrl ? (
							<VideoPlayer
								src={video.videoUrl}
								poster='/poster.webp'
								onPlay={() => {
									videoPlayedRef.current = true;
									setIsVideoPlaying(true);
									if (!videoWatchStartRef.current)
										videoWatchStartRef.current = Date.now();
									// Track time to first play
									if (firstPlayTimeRef.current == null) {
										firstPlayTimeRef.current =
											Date.now() - (startTimeRef.current ?? Date.now());
									}
									// Send PLAY event + flush any buffered heartbeats + update engagement
									flushVideoEvents();
									const pos = lastHeartbeatRef.current;
									sendVideoEventNow({
										clientEventId: crypto.randomUUID(),
										eventType: 'PLAY',
										position: pos,
										clientTimestamp: new Date().toISOString(),
									});
									// Anchor heartbeat origin at the play position; the first real HEARTBEAT
									// will fire after 1s of actual playback. No synthetic heartbeat here.
									lastSentHeartbeatPos.current = pos;
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
									// Flush heartbeats + send PAUSE + update engagement
									flushVideoEvents();
									sendVideoEventNow({
										clientEventId: crypto.randomUUID(),
										eventType: 'PAUSE',
										position: lastHeartbeatRef.current,
										clientTimestamp: new Date().toISOString(),
									});
									sendUpdate({
										videoPlayed: true,
										videoWatchTime: videoWatchAccumRef.current,
									});
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
									// Flush heartbeats + send ENDED + update engagement
									flushVideoEvents();
									sendVideoEventNow({
										clientEventId: crypto.randomUUID(),
										eventType: 'ENDED',
										position: lastHeartbeatRef.current,
										clientTimestamp: new Date().toISOString(),
									});
									sendUpdate({
										videoPlayed: true,
										videoWatchTime: videoWatchAccumRef.current,
										videoCompleted: true,
									});
								}}
								onTimeUpdate={currentTime => {
									lastHeartbeatRef.current = currentTime;
									// Buffer HEARTBEAT every 1 second of playback for second-level
									// position tracking. Plyr fires onTimeUpdate ~4x/sec, so we gate
									// on video currentTime advancing at least 1s since the last send.
									if (currentTime - lastSentHeartbeatPos.current >= 1) {
										lastSentHeartbeatPos.current = currentTime;
										videoEventsBuffer.current.push({
											clientEventId: crypto.randomUUID(),
											eventType: 'HEARTBEAT',
											position: currentTime,
											clientTimestamp: new Date().toISOString(),
										});
									}
									// Flush every 10 buffered heartbeats (≈10s) to stay well under the
									// 60 requests/min per-visit rate limit while keeping data fresh.
									if (videoEventsBuffer.current.length >= 10)
										flushVideoEvents();
								}}
								onSeeked={(seekFrom, seekTo) => {
									// Flush heartbeats + send SEEK. Do NOT push a synthetic HEARTBEAT —
									// a real one will come once playback has advanced 1s past seekTo.
									flushVideoEvents();
									lastHeartbeatRef.current = seekTo;
									lastSentHeartbeatPos.current = seekTo;
									sendVideoEventNow({
										clientEventId: crypto.randomUUID(),
										eventType: 'SEEK',
										position: seekTo,
										seekFrom,
										seekTo,
										clientTimestamp: new Date().toISOString(),
									});
								}}
								onBufferStart={() => {
									bufferStartRef.current = Date.now();
									bufferCountRef.current++;
									sendVideoEventNow({
										clientEventId: crypto.randomUUID(),
										eventType: 'BUFFERING',
										position: lastHeartbeatRef.current,
										clientTimestamp: new Date().toISOString(),
									});
								}}
								onBufferEnd={() => {
									if (bufferStartRef.current) {
										bufferTotalMsRef.current +=
											Date.now() - bufferStartRef.current;
										bufferStartRef.current = null;
									}
								}}
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

			{landing.productUrl && (
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

// Subscribe to the md: breakpoint via matchMedia. Returns false during SSR
// and on first client render, then flips to the real value on hydration —
// acceptable because the caller uses it to relax mobile-only behavior, not
// to decide what to render on the server.
function useIsDesktop(): boolean {
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

function SpecRow({
	icon,
	label,
	value,
	delay,
}: {
	icon: React.ReactNode;
	label: string;
	value: string;
	delay?: number;
}) {
	return (
		<div
			data-animate
			{...(delay ? { 'data-animate-delay': delay } : {})}
			className='flex items-center gap-3 bg-gray-50 rounded-lg px-4 py-3 hover:bg-gray-100 transition-colors'>
			<span className='flex-shrink-0 spec-icon'>{icon}</span>
			<div className='min-w-0'>
				<p className='text-xs text-gray-500 m-0'>{label}</p>
				<p className='text-sm font-semibold text-gray-900 truncate m-0'>
					{value}
				</p>
			</div>
		</div>
	);
}
