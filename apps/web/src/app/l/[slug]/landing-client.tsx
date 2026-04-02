"use client";

import { useEffect, useRef, useCallback } from "react";
import { Lato } from "next/font/google";
import Image from "next/image";
import { Laptop, Cpu, MemoryStick, HardDrive, Monitor, MonitorSmartphone } from "lucide-react";

const lato = Lato({ weight: ["400", "700"], subsets: ["latin", "latin-ext"] });

// Simple hash for fingerprinting
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + ch;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

type Lang = "pl" | "uk" | "ru" | "en";

const t = {
  pl: {
    badge: "Osobista recenzja dla Ciebie",
    greeting: "Witamy",
    intro: "Nasz ekspert przygotował recenzję wideo specjalnie dla Ciebie — obejrzyj i podejmij najlepszą decyzję!",
    benefit1Title: "Recenzja eksperta",
    benefit1Desc: "Nasi specjaliści szczegółowo sprawdzili ten produkt",
    benefit2Title: "Uczciwe porównanie",
    benefit2Desc: "Obiektywna ocena zalet i wad",
    benefit3Title: "Najlepsza cena",
    benefit3Desc: "Gwarantujemy najkorzystniejszą ofertę",
    ctaSub: "Gwarancja 12 mies. · Darmowa dostawa · Zwrot 30 dni",
    trustWarranty: "Gwarancja 12 miesięcy",
    trustDelivery: "Darmowa dostawa pojutrze",
    trustReturn: "Zwrot w ciągu 30 dni",
    ctaUrgency: "Oferta ograniczona czasowo",
    ctaProof: "osób ogląda teraz",
    ctaFree: "Darmowa dostawa",
    copyright: "Eksperckie recenzje laptopów",
    specsTitle: "Specyfikacja",
    specModel: "Model",
    specCpu: "Procesor",
    specRam: "Pamięć RAM",
    specStorage: "Dysk",
    specGpu: "Karta graficzna",
    specDisplay: "Wyświetlacz",
  },
  uk: {
    badge: "Персональний огляд для вас",
    greeting: "Вітаємо",
    intro: "Наш експерт підготував відео-огляд спеціально для вас — перегляньте та зробіть найкращий вибір!",
    benefit1Title: "Експертний огляд",
    benefit1Desc: "Наші спеціалісти детально перевірили цей продукт",
    benefit2Title: "Чесне порівняння",
    benefit2Desc: "Об'єктивна оцінка переваг та недоліків",
    benefit3Title: "Найкраща ціна",
    benefit3Desc: "Гарантуємо найвигіднішу пропозицію",
    ctaSub: "Гарантія 12 міс. · Безкоштовна доставка · Повернення 30 днів",
    trustWarranty: "Гарантія 12 місяців",
    trustDelivery: "Безкоштовна доставка післязавтра",
    trustReturn: "Повернення протягом 30 днів",
    ctaUrgency: "Пропозиція обмежена в часі",
    ctaProof: "осіб дивляться зараз",
    ctaFree: "Безкоштовна доставка",
    copyright: "Експертні огляди ноутбуків",
    specsTitle: "Характеристики",
    specModel: "Модель",
    specCpu: "Процесор",
    specRam: "Оперативна пам'ять",
    specStorage: "Накопичувач",
    specGpu: "Відеокарта",
    specDisplay: "Дисплей",
  },
  ru: {
    badge: "Персональный обзор для вас",
    greeting: "Здравствуйте",
    intro: "Наш эксперт подготовил видеообзор специально для вас — посмотрите и примите лучшее решение!",
    benefit1Title: "Экспертный обзор",
    benefit1Desc: "Наши специалисты детально проверили этот продукт",
    benefit2Title: "Честное сравнение",
    benefit2Desc: "Объективная оценка достоинств и недостатков",
    benefit3Title: "Лучшая цена",
    benefit3Desc: "Гарантируем самое выгодное предложение",
    ctaSub: "Гарантия 12 мес. · Бесплатная доставка · Возврат 30 дней",
    trustWarranty: "Гарантия 12 месяцев",
    trustDelivery: "Бесплатная доставка послезавтра",
    trustReturn: "Возврат в течение 30 дней",
    ctaUrgency: "Предложение ограничено по времени",
    ctaProof: "чел. смотрят сейчас",
    ctaFree: "Бесплатная доставка",
    copyright: "Экспертные обзоры ноутбуков",
    specsTitle: "Характеристики",
    specModel: "Модель",
    specCpu: "Процессор",
    specRam: "Оперативная память",
    specStorage: "Накопитель",
    specGpu: "Видеокарта",
    specDisplay: "Дисплей",
  },
  en: {
    badge: "Personal review for you",
    greeting: "Hello",
    intro: "Our expert has prepared a video review especially for you — watch it and make the best decision!",
    benefit1Title: "Expert review",
    benefit1Desc: "Our specialists have thoroughly tested this product",
    benefit2Title: "Honest comparison",
    benefit2Desc: "Objective assessment of pros and cons",
    benefit3Title: "Best price",
    benefit3Desc: "We guarantee the most competitive offer",
    ctaSub: "12-month warranty · Free delivery · 30-day returns",
    trustWarranty: "12-month warranty",
    trustDelivery: "Free delivery tomorrow",
    trustReturn: "30-day returns",
    ctaUrgency: "Limited time offer",
    ctaProof: "people viewing now",
    ctaFree: "Free delivery",
    copyright: "Expert laptop reviews",
    specsTitle: "Specifications",
    specModel: "Model",
    specCpu: "Processor",
    specRam: "RAM",
    specStorage: "Storage",
    specGpu: "Graphics",
    specDisplay: "Display",
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
  };
  video: {
    youtubeId: string;
    title: string;
  };
}

// Parse product name like "Apple MacBook Pro A1990 (2019)/i7-8850H/32GB/512GB/Radeon Pro555x (4GB)/15.4"
function parseSpecs(productName: string | null) {
  if (!productName) return null;

  // Clean video title prefixes and hashtags/id suffixes
  const cleaned = productName
    .replace(/^(Wideorecenzja|Recenzja|Review)\s+/i, "")
    .replace(/\s+id:\d+.*$/i, "");

  const parts = cleaned.split("/").map((p) => p.trim());
  if (parts.length < 3) return null;

  // If model part contains CPU info (e.g. "Dell Latitude 5500 i5-8gen"), split them
  const cpuPattern = /\b(i[3579]-?\w+|ryzen\s*\w+|m[12]\s*\w+|celeron\s*\w+|pentium\s*\w+|xeon\s*\w+|amd\s*\w+)/i;
  let model = parts[0] || null;
  let cpu = parts.find((p, i) => i > 0 && cpuPattern.test(p)) || null;

  if (!cpu && model && cpuPattern.test(model)) {
    const match = model.match(cpuPattern);
    if (match) {
      cpu = model.substring(match.index!).trim();
      model = model.substring(0, match.index!).trim();
    }
  }
  if (!cpu) cpu = parts.find((p) => cpuPattern.test(p)) || null;
  const ram = parts.find((p) => /^\d+\s*GB(\s*RAM)?$/i.test(p)) || null;
  const storage = parts.find((p) => /^\d+\s*(GB|TB)(\s*SSD|\s*HDD|\s*NVMe)?$/i.test(p) && p !== ram) || null;
  const gpu = parts.find((p) => /radeon|geforce|nvidia|gtx|rtx|intel\s*(hd|iris|uhd)|pro\s*\d{3}/i.test(p)) || null;
  const display = parts.find((p) => /^\d{1,2}(\.\d+)?(")?$/i.test(p)) || null;

  if (!model && !cpu && !ram) return null;

  return { model, cpu, ram, storage, gpu, display: display ? `${display}"` : null };
}

export function LandingClient({ landing, video }: Props) {
  const lang = landing.language;
  const tr = t[lang] || t.pl;
  const specs = parseSpecs(landing.productName) || parseSpecs(video.title);

  const visitIdRef = useRef<string | null>(null);
  const startTimeRef = useRef<number>(null);
  const maxScrollRef = useRef(0);
  const clickCountRef = useRef(0);
  const tabSwitchesRef = useRef(0);
  const videoPlayedRef = useRef(false);
  const videoWatchStartRef = useRef<number | null>(null);
  const videoWatchAccumRef = useRef(0);

  // Send engagement update — must use PATCH (sendBeacon only does POST, so we avoid it)
  const sendUpdate = useCallback((data: Record<string, unknown>) => {
    if (!visitIdRef.current) return;
    const body = JSON.stringify({ visitId: visitIdRef.current, ...data });
    try {
      fetch(`/api/landings/${landing.slug}/track`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true, // ensures delivery even on page unload
      }).catch(() => {});
    } catch { /* ignore */ }
  }, [landing.slug]);

  // Initial visit registration — collect ABSOLUTELY EVERYTHING
  useEffect(() => {
    startTimeRef.current = Date.now();
    const sessionId = sessionStorage.getItem("_sid") || crypto.randomUUID();
    sessionStorage.setItem("_sid", sessionId);
    const urlParams = new URLSearchParams(window.location.search);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nav = navigator as any;
    const conn = (nav.connection || nav.mozConnection || nav.webkitConnection) as {
      effectiveType?: string; downlink?: number; rtt?: number; saveData?: boolean; type?: string;
    } | undefined;
    const mm = (q: string) => { try { return window.matchMedia?.(q).matches ?? null; } catch { return null; } };
    const s = (fn: () => unknown) => { try { return fn(); } catch { return null; } };

    // --- GPU / WebGL ---
    let gpuRenderer: string | null = null, gpuVendor: string | null = null, webglHash: string | null = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const webglExtended: any = {};
    try {
      const c = document.createElement("canvas");
      const gl = (c.getContext("webgl") || c.getContext("experimental-webgl")) as WebGLRenderingContext | null;
      if (gl) {
        const dbg = gl.getExtension("WEBGL_debug_renderer_info");
        if (dbg) {
          gpuRenderer = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) || null;
          gpuVendor = gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) || null;
        }
        const glParams = [gl.getParameter(gl.VERSION), gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
          gl.getParameter(gl.MAX_TEXTURE_SIZE), gl.getParameter(gl.MAX_RENDERBUFFER_SIZE), gpuRenderer, gpuVendor];
        webglHash = simpleHash(glParams.join("|"));
        webglExtended.version = gl.getParameter(gl.VERSION);
        webglExtended.shadingLang = gl.getParameter(gl.SHADING_LANGUAGE_VERSION);
        webglExtended.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
        webglExtended.maxRenderBufferSize = gl.getParameter(gl.MAX_RENDERBUFFER_SIZE);
        webglExtended.maxViewportDims = Array.from(gl.getParameter(gl.MAX_VIEWPORT_DIMS) || []);
        webglExtended.maxVertexAttribs = gl.getParameter(gl.MAX_VERTEX_ATTRIBS);
        webglExtended.maxVaryingVectors = gl.getParameter(gl.MAX_VARYING_VECTORS);
        webglExtended.maxVertexUniformVectors = gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS);
        webglExtended.maxFragmentUniformVectors = gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS);
        webglExtended.aliasedLineWidthRange = Array.from(gl.getParameter(gl.ALIASED_LINE_WIDTH_RANGE) || []);
        webglExtended.aliasedPointSizeRange = Array.from(gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE) || []);
        webglExtended.extensions = gl.getSupportedExtensions();
        try {
          const hp = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
          webglExtended.shaderPrecision = hp ? { rangeMin: hp.rangeMin, rangeMax: hp.rangeMax, precision: hp.precision } : null;
        } catch { /* */ }
      }
    } catch { /* */ }

    // --- Canvas fingerprint ---
    let canvasHash: string | null = null;
    try {
      const c = document.createElement("canvas"); c.width = 280; c.height = 60;
      const ctx = c.getContext("2d");
      if (ctx) {
        ctx.textBaseline = "top"; ctx.font = "14px Arial";
        ctx.fillStyle = "#f60"; ctx.fillRect(125, 1, 62, 20);
        ctx.fillStyle = "#069"; ctx.fillText("Cwm fjord bank", 2, 15);
        ctx.fillStyle = "rgba(102,204,0,0.7)"; ctx.fillText("glyphs vext quiz", 4, 37);
        ctx.arc(50, 50, 10, 0, Math.PI * 2); ctx.stroke();
        canvasHash = simpleHash(c.toDataURL());
      }
    } catch { /* */ }

    // --- Audio fingerprint ---
    let audioHash: string | null = null;
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AC) {
        const ctx = new AC(); const osc = ctx.createOscillator(); const an = ctx.createAnalyser();
        const g = ctx.createGain(); g.gain.value = 0; osc.type = "triangle";
        osc.connect(an); an.connect(g); g.connect(ctx.destination); osc.start(0);
        const d = new Float32Array(an.frequencyBinCount); an.getFloatFrequencyData(d);
        audioHash = simpleHash(Array.from(d.slice(0, 30)).join(","));
        osc.stop(); ctx.close();
      }
    } catch { /* */ }

    // --- Ad blocker ---
    let adBlocker: boolean | null = null;
    try {
      const ad = document.createElement("div"); ad.innerHTML = "&nbsp;";
      ad.className = "adsbox ad-banner textads"; ad.style.cssText = "position:absolute;left:-9999px;top:-9999px;width:1px;height:1px";
      document.body.appendChild(ad); adBlocker = ad.offsetHeight === 0; document.body.removeChild(ad);
    } catch { /* */ }

    // --- DOMRect fingerprint ---
    let domRectHash: string | null = null;
    try {
      const el = document.createElement("span"); el.textContent = "Fingerprint DOMRect Benchmark";
      el.style.cssText = "position:absolute;left:-9999px;font-size:16px;font-family:Arial,sans-serif";
      document.body.appendChild(el);
      const r = el.getBoundingClientRect();
      domRectHash = simpleHash(`${r.x},${r.y},${r.width},${r.height},${r.top},${r.right},${r.bottom},${r.left}`);
      document.body.removeChild(el);
    } catch { /* */ }

    // --- Emoji rendering fingerprint ---
    let emojiHash: string | null = null;
    try {
      const c = document.createElement("canvas"); c.width = 200; c.height = 30;
      const ctx = c.getContext("2d");
      if (ctx) { ctx.font = "20px serif"; ctx.fillText("🏴‍☠️🦊🌈🔥💎", 0, 22); emojiHash = simpleHash(c.toDataURL()); }
    } catch { /* */ }

    // --- Math fingerprint ---
    const mathFingerprint = s(() => simpleHash([
      Math.tan(-1e300), Math.sinh(1), Math.cosh(1), Math.tanh(1),
      Math.expm1(1), Math.log1p(1), Math.cbrt(2), Math.log2(3),
    ].join(",")));

    // --- Installed fonts (fast) ---
    const detectedFonts = s(() => {
      const testFonts = ["Arial","Verdana","Times New Roman","Courier New","Georgia","Palatino","Garamond",
        "Comic Sans MS","Impact","Lucida Console","Tahoma","Trebuchet MS","Helvetica","Futura",
        "Calibri","Cambria","Consolas","Segoe UI","Roboto","Open Sans","Montserrat","Lato",
        "Source Code Pro","Fira Code","Ubuntu","Cantarell","SF Pro","Apple Color Emoji"];
      const c = document.createElement("canvas"); const ctx = c.getContext("2d"); if (!ctx) return [];
      const baseline = "mmmmmmmmmmlli";
      ctx.font = "72px monospace"; const defaultWidth = ctx.measureText(baseline).width;
      ctx.font = "72px serif"; const serifWidth = ctx.measureText(baseline).width;
      return testFonts.filter(f => {
        ctx.font = `72px "${f}",monospace`; const w1 = ctx.measureText(baseline).width;
        ctx.font = `72px "${f}",serif`; const w2 = ctx.measureText(baseline).width;
        return w1 !== defaultWidth || w2 !== serifWidth;
      });
    });

    // --- Permissions ---
    const permissionsPromise = (async () => {
      if (!navigator.permissions?.query) return null;
      const perms: Record<string, string> = {};
      for (const name of ["camera", "microphone", "notifications", "geolocation", "persistent-storage", "push"]) {
        try { const r = await navigator.permissions.query({ name: name as PermissionName }); perms[name] = r.state; } catch { /* */ }
      }
      return perms;
    })();

    // --- Speech voices ---
    const voicesPromise = new Promise<string[] | null>(resolve => {
      try {
        const voices = speechSynthesis?.getVoices();
        if (voices?.length) { resolve(voices.map(v => v.name)); return; }
        speechSynthesis?.addEventListener("voiceschanged", () => {
          resolve(speechSynthesis.getVoices().map(v => v.name));
        }, { once: true });
        setTimeout(() => resolve(null), 2000);
      } catch { resolve(null); }
    });

    // --- Media devices ---
    const devicesPromise = (async () => {
      try {
        const devs = await navigator.mediaDevices?.enumerateDevices();
        if (!devs) return null;
        return { audioinput: devs.filter(d => d.kind === "audioinput").length,
          audiooutput: devs.filter(d => d.kind === "audiooutput").length,
          videoinput: devs.filter(d => d.kind === "videoinput").length };
      } catch { return null; }
    })();

    // --- Battery ---
    const batteryPromise = nav.getBattery
      ? nav.getBattery().then((b: { level: number; charging: boolean }) => ({ batteryLevel: b.level, batteryCharging: b.charging })).catch(() => ({ batteryLevel: null, batteryCharging: null }))
      : Promise.resolve({ batteryLevel: null, batteryCharging: null });

    // --- Storage ---
    const storagePromise = nav.storage?.estimate
      ? nav.storage.estimate().then((e: { quota?: number; usage?: number }) => ({ quotaMB: e.quota ? Math.round(e.quota / 1024 / 1024) : null, usageMB: e.usage ? Math.round(e.usage / 1024 / 1024) : null })).catch(() => null)
      : Promise.resolve(null);

    // --- Collect all async data ---
    Promise.all([batteryPromise, storagePromise, permissionsPromise, voicesPromise, devicesPromise]).then(
      ([battery, storage, permissions, voices, mediaDevices]) => {

      // --- Extended data (JSON blob) ---
      const extendedData = {
        // Screen extended
        colorDepth: screen.colorDepth, pixelDepth: screen.pixelDepth,
        availWidth: screen.availWidth, availHeight: screen.availHeight,
        outerWidth: window.outerWidth, outerHeight: window.outerHeight,
        screenX: window.screenX, screenY: window.screenY,
        orientation: s(() => ({ type: screen.orientation?.type, angle: screen.orientation?.angle })),

        // Intl
        intl: s(() => {
          const dtf = Intl.DateTimeFormat().resolvedOptions();
          return { timeZone: dtf.timeZone, locale: dtf.locale, calendar: dtf.calendar, numberingSystem: dtf.numberingSystem };
        }),
        timezoneOffset: new Date().getTimezoneOffset(),

        // Navigator extended
        webdriver: nav.webdriver ?? null, onLine: nav.onLine,
        pluginsCount: nav.plugins?.length ?? 0, mimeTypesCount: nav.mimeTypes?.length ?? 0,
        pdfViewerEnabled: nav.pdfViewerEnabled ?? null,
        appVersion: nav.appVersion?.slice(0, 200), appCodeName: nav.appCodeName,
        userAgentData: s(() => nav.userAgentData ? { brands: nav.userAgentData.brands, mobile: nav.userAgentData.mobile, platform: nav.userAgentData.platform } : null),

        // CSS Media Queries
        media: {
          prefersColorScheme: mm("(prefers-color-scheme: dark)") ? "dark" : "light",
          prefersReducedMotion: mm("(prefers-reduced-motion: reduce)"),
          prefersContrast: mm("(prefers-contrast: more)") ? "more" : mm("(prefers-contrast: less)") ? "less" : "no-preference",
          prefersReducedTransparency: mm("(prefers-reduced-transparency: reduce)"),
          forcedColors: mm("(forced-colors: active)"),
          invertedColors: mm("(inverted-colors: inverted)"),
          colorGamut: mm("(color-gamut: rec2020)") ? "rec2020" : mm("(color-gamut: p3)") ? "p3" : "srgb",
          dynamicRange: mm("(dynamic-range: high)") ? "high" : "standard",
          pointer: mm("(pointer: fine)") ? "fine" : mm("(pointer: coarse)") ? "coarse" : "none",
          anyPointer: mm("(any-pointer: fine)") ? "fine" : mm("(any-pointer: coarse)") ? "coarse" : "none",
          hover: mm("(hover: hover)"), anyHover: mm("(any-hover: hover)"),
          displayMode: mm("(display-mode: standalone)") ? "standalone" : mm("(display-mode: fullscreen)") ? "fullscreen" : "browser",
          monochrome: mm("(monochrome)"),
        },

        // Connection extended
        connectionFull: conn ? { effectiveType: conn.effectiveType, downlink: conn.downlink, rtt: conn.rtt, saveData: conn.saveData, type: (conn as { type?: string }).type } : null,

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
          const m = (performance as { memory?: { jsHeapSizeLimit: number; totalJSHeapSize: number; usedJSHeapSize: number } }).memory;
          return m ? { heapLimit: Math.round(m.jsHeapSizeLimit / 1024 / 1024), heapTotal: Math.round(m.totalJSHeapSize / 1024 / 1024), heapUsed: Math.round(m.usedJSHeapSize / 1024 / 1024) } : null;
        }),

        // Storage
        storage,

        // Feature detection
        features: {
          bluetooth: "bluetooth" in navigator,
          gpu: "gpu" in navigator,
          serial: "serial" in navigator,
          usb: "usb" in navigator,
          hid: "hid" in navigator,
          xr: "xr" in navigator,
          scheduling: "scheduling" in navigator,
          sharedArrayBuffer: typeof SharedArrayBuffer !== "undefined",
          offscreenCanvas: typeof OffscreenCanvas !== "undefined",
          webAssembly: typeof WebAssembly !== "undefined",
          serviceWorker: "serviceWorker" in navigator,
          webRTC: typeof RTCPeerConnection !== "undefined",
          webGL2: !!document.createElement("canvas").getContext("webgl2"),
          indexedDB: typeof indexedDB !== "undefined",
          webSocket: typeof WebSocket !== "undefined",
          webTransport: typeof (window as unknown as { WebTransport?: unknown }).WebTransport !== "undefined",
          intersectionObserver: typeof IntersectionObserver !== "undefined",
          resizeObserver: typeof ResizeObserver !== "undefined",
          mutationObserver: typeof MutationObserver !== "undefined",
          performanceObserver: typeof PerformanceObserver !== "undefined",
        },

        // Ad blocker
        adBlocker,
      };

      fetch(`/api/landings/${landing.slug}/track`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          screenWidth: screen.width, screenHeight: screen.height,
          viewportWidth: window.innerWidth, viewportHeight: window.innerHeight,
          pixelRatio: window.devicePixelRatio,
          touchSupport: "ontouchstart" in window || navigator.maxTouchPoints > 0,
          maxTouchPoints: navigator.maxTouchPoints || 0,
          cpuCores: nav.hardwareConcurrency || null,
          deviceMemory: nav.deviceMemory || null,
          gpuRenderer, gpuVendor,
          ...battery,
          darkMode: mm("(prefers-color-scheme: dark)"),
          reducedMotion: mm("(prefers-reduced-motion: reduce)"),
          cookiesEnabled: navigator.cookieEnabled,
          doNotTrack: navigator.doNotTrack === "1",
          adBlocker,
          pdfSupport: nav.pdfViewerEnabled ?? null,
          storageQuota: storage?.quotaMB ?? null,
          downlink: conn?.downlink ?? null, rtt: conn?.rtt ?? null, saveData: conn?.saveData ?? null,
          referrer: document.referrer || null,
          utmSource: urlParams.get("utm_source"), utmMedium: urlParams.get("utm_medium"),
          utmCampaign: urlParams.get("utm_campaign"), utmTerm: urlParams.get("utm_term"), utmContent: urlParams.get("utm_content"),
          browserLang: navigator.language, browserLangs: nav.languages?.join(", ") || null,
          platform: navigator.platform, vendor: navigator.vendor || null,
          connectionType: conn?.effectiveType || null,
          canvasHash, webglHash, audioHash,
          extendedData,
        }),
      })
        .then((r) => r.json())
        .then((d) => { visitIdRef.current = d.visitId; })
        .catch(() => {});
    });
  }, [landing.slug]);

  // Scroll tracking
  useEffect(() => {
    function onScroll() {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (docHeight > 0) {
        const pct = Math.round((scrollTop / docHeight) * 100);
        if (pct > maxScrollRef.current) maxScrollRef.current = pct;
      }
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Click tracking
  useEffect(() => {
    function onClick() { clickCountRef.current++; }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  // Tab visibility tracking
  useEffect(() => {
    function onVisibility() {
      if (document.hidden) tabSwitchesRef.current++;
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // YouTube iframe API — video tracking via postMessage
  useEffect(() => {
    const iframeEl = document.getElementById("yt-player") as HTMLIFrameElement | null;
    if (!iframeEl) return;
    const iframe = iframeEl; // non-null for closures

    let listeningActive = false;

    function onMessage(e: MessageEvent) {
      // YouTube sends both string and object messages
      let data: { event?: string; info?: { playerState?: number }; channel?: string } | null = null;
      try {
        data = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
      } catch { return; }
      if (!data) return;

      // When YouTube confirms it's listening, subscribe to state changes
      if (data.event === "onReady" || (data.event === "initialDelivery" && !listeningActive)) {
        listeningActive = true;
        iframe.contentWindow?.postMessage(JSON.stringify({
          event: "command", func: "addEventListener", args: ["onStateChange"],
        }), "*");
      }

      // Track state changes: -1=unstarted, 0=ended, 1=playing, 2=paused, 3=buffering
      if (data.event === "infoDelivery" && data.info && data.info.playerState !== undefined) {
        const state = data.info.playerState;
        if (state === 1) { // playing
          videoPlayedRef.current = true;
          if (!videoWatchStartRef.current) videoWatchStartRef.current = Date.now();
        }
        if (state === 0 || state === 2) { // ended or paused
          if (videoWatchStartRef.current) {
            videoWatchAccumRef.current += Math.round((Date.now() - videoWatchStartRef.current) / 1000);
            videoWatchStartRef.current = null;
          }
        }
      }

      // Also detect via "onStateChange" event directly
      if (data.event === "onStateChange" && data.info !== undefined) {
        const state = typeof data.info === "number" ? data.info : (data.info as { playerState?: number })?.playerState;
        if (state === 1) {
          videoPlayedRef.current = true;
          if (!videoWatchStartRef.current) videoWatchStartRef.current = Date.now();
        }
        if (state === 0 || state === 2) {
          if (videoWatchStartRef.current) {
            videoWatchAccumRef.current += Math.round((Date.now() - videoWatchStartRef.current) / 1000);
            videoWatchStartRef.current = null;
          }
        }
      }
    }

    window.addEventListener("message", onMessage);

    // Keep telling YouTube we're listening (it needs periodic pings)
    const timer = setInterval(() => {
      if (iframe.contentWindow) {
        iframe.contentWindow.postMessage(JSON.stringify({ event: "listening" }), "*");
      }
    }, 500);

    // Also try IntersectionObserver — if user scrolled to video, count as "interest"
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && entry.intersectionRatio > 0.5) {
          // User can see the video — YouTube tracking handles the rest
        }
      });
    }, { threshold: 0.5 });
    observer.observe(iframe);

    return () => {
      clearInterval(timer);
      window.removeEventListener("message", onMessage);
      observer.disconnect();
    };
  }, []);

  // Periodic engagement updates + final update on unload
  useEffect(() => {
    function buildEngagement() {
      // Accumulate video time if still playing
      let videoTime = videoWatchAccumRef.current;
      if (videoWatchStartRef.current) {
        videoTime += Math.round((Date.now() - videoWatchStartRef.current) / 1000);
      }
      return {
        timeOnPage: Math.round((Date.now() - (startTimeRef.current ?? Date.now())) / 1000),
        maxScrollDepth: maxScrollRef.current,
        totalClicks: clickCountRef.current,
        tabSwitches: tabSwitchesRef.current,
        videoPlayed: videoPlayedRef.current,
        videoWatchTime: videoTime,
        pageVisible: !document.hidden,
      };
    }

    // First update after 5 seconds, then every 10 seconds
    const firstTimeout = setTimeout(() => sendUpdate(buildEngagement()), 5000);
    const interval = setInterval(() => {
      sendUpdate(buildEngagement());
    }, 10000);

    // On unload — final send
    function onUnload() {
      sendUpdate(buildEngagement());
    }
    window.addEventListener("beforeunload", onUnload);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) sendUpdate(buildEngagement());
    });

    return () => {
      clearTimeout(firstTimeout);
      clearInterval(interval);
      window.removeEventListener("beforeunload", onUnload);
    };
  }, [sendUpdate]);

  function handleBuyClick() {
    sendUpdate({ buyButtonClicked: true, timeOnPage: Math.round((Date.now() - (startTimeRef.current ?? Date.now())) / 1000) });
    fetch(`/api/landings/${landing.slug}/click`, { method: "POST" })
      .finally(() => {
        window.location.href = landing.productUrl;
      });
  }

  return (
    <div className={`min-h-screen bg-gray-50 ${lato.className}`}>
      {/* Hero */}
      <div className="bg-gradient-to-br from-[#fb7830] to-[#fbbf24] pb-20 pt-8 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <Image src="/LG_logo2.webp" alt="Laptop Guru" width={100} height={33} className="mx-auto mb-4 brightness-0 invert w-auto h-auto" />
          <h1 className="text-3xl sm:text-4xl font-bold text-white mb-3">
            {tr.greeting}{landing.customerName ? `, ${landing.customerName}` : ""}!
          </h1>
          <p className="text-lg text-white/90">
            {tr.intro}
          </p>
        </div>
      </div>

      {/* Video */}
      <div className="max-w-3xl mx-auto px-4 -mt-12">
        <div className="relative aspect-video rounded-2xl overflow-hidden shadow-2xl bg-gray-900">
          <iframe
            id="yt-player"
            src={`https://www.youtube.com/embed/${video.youtubeId}?rel=0&enablejsapi=1`}
            title={video.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="absolute inset-0 w-full h-full"
          />
        </div>
        <p className="text-sm text-gray-600 mt-3 text-center">{video.title}</p>
      </div>

      <main className="max-w-3xl mx-auto px-4 py-10">
        {/* Personal note */}
        {landing.personalNote && (
          <div className="bg-orange-50 border-l-4 border-[#fb7830] rounded-r-lg p-4 mb-6 italic text-gray-700">
            {landing.personalNote}
          </div>
        )}

        {/* Trust badges */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6 mb-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col items-center text-center flex-1">
              <img src="https://www.laptopguru.pl/cdn/shop/files/gg2.png?v=1767364526&width=400" alt="" className="h-10 mb-2" />
              <span className="text-xs sm:text-sm text-gray-600 font-medium leading-tight">{tr.trustWarranty}</span>
            </div>
            <div className="flex flex-col items-center text-center flex-1">
              <img src="https://www.laptopguru.pl/cdn/shop/files/dd1.png?v=1767364860&width=400" alt="" className="h-10 mb-2" />
              <span className="text-xs sm:text-sm text-gray-600 font-medium leading-tight">{tr.trustDelivery}</span>
            </div>
            <div className="flex flex-col items-center text-center flex-1">
              <img src="https://www.laptopguru.pl/cdn/shop/files/vv1.png?v=1767365084&width=400" alt="" className="h-10 mb-2" />
              <span className="text-xs sm:text-sm text-gray-600 font-medium leading-tight">{tr.trustReturn}</span>
            </div>
          </div>
        </div>

        {/* Product specs */}
        {specs && (
          <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-6 mb-10">
            <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-[#fb7830]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25h-13.5A2.25 2.25 0 0 1 3 15V5.25m18 0A2.25 2.25 0 0 0 18.75 3H5.25A2.25 2.25 0 0 0 3 5.25m18 0V12a2.25 2.25 0 0 1-2.25 2.25h-13.5A2.25 2.25 0 0 1 3 12V5.25" />
              </svg>
              {tr.specsTitle}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {specs.model && (
                <SpecRow icon={<Laptop className="w-5 h-5 text-brand" />} label={tr.specModel} value={specs.model} />
              )}
              {specs.cpu && (
                <SpecRow icon={<Cpu className="w-5 h-5 text-brand" />} label={tr.specCpu} value={specs.cpu} />
              )}
              {specs.ram && (
                <SpecRow icon={<MemoryStick className="w-5 h-5 text-brand" />} label={tr.specRam} value={specs.ram} />
              )}
              {specs.storage && (
                <SpecRow icon={<HardDrive className="w-5 h-5 text-brand" />} label={tr.specStorage} value={specs.storage} />
              )}
              {specs.gpu && (
                <SpecRow icon={<Monitor className="w-5 h-5 text-brand" />} label={tr.specGpu} value={specs.gpu} />
              )}
              {specs.display && (
                <SpecRow icon={<MonitorSmartphone className="w-5 h-5 text-brand" />} label={tr.specDisplay} value={specs.display} />
              )}
            </div>
          </div>
        )}

      </main>

      {/* Fixed bottom CTA */}
      {landing.productUrl && (
        <div className="fixed bottom-0 inset-x-0 z-50 bg-white/95 backdrop-blur-md border-t border-gray-100 shadow-[0_-4px_24px_rgba(0,0,0,0.1)]">
          <div className="max-w-3xl mx-auto px-4 py-3">
            <button
                onClick={handleBuyClick}
                className="cursor-pointer group relative w-full bg-gradient-to-r from-[#fb7830] to-[#e56a25] hover:from-[#e56a25] hover:to-[#d45a15] text-white py-4 rounded-xl text-lg font-bold shadow-[0_4px_20px_rgba(251,120,48,0.4)] hover:shadow-[0_6px_28px_rgba(251,120,48,0.5)] transition-all active:scale-[0.98] overflow-hidden"
              >
                {/* Shimmer effect */}
                <span className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                <span className="relative">{landing.buyButtonText}</span>
            </button>
            <p className="text-xs text-gray-400 text-center mt-2">{tr.ctaSub}</p>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="bg-gray-900 py-8 text-center">
        <p className="text-sm text-white/40">
          © {new Date().getFullYear()} laptopguru.pl — {tr.copyright}
        </p>
      </footer>
    </div>
  );
}

function SpecRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 bg-gray-50 rounded-lg px-4 py-3">
      <span className="flex-shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-sm font-semibold text-gray-900 truncate">{value}</p>
      </div>
    </div>
  );
}

