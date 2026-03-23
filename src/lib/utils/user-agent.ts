export interface ParsedUA {
  browser: string;
  browserVersion: string | null;
  os: string;
  osVersion: string | null;
  deviceType: "desktop" | "mobile" | "tablet";
}

export function parseUA(ua: string): ParsedUA {
  const browser =
    ua.match(/Edg\//i) ? "Edge" :
    ua.match(/OPR\//i) ? "Opera" :
    ua.match(/(?:Chrome|CriOS)\//i) && !ua.match(/Edg\//i) ? "Chrome" :
    ua.match(/(?:Firefox|FxiOS)\//i) ? "Firefox" :
    ua.match(/Safari\//i) && !ua.match(/Chrome/i) ? "Safari" :
    ua.match(/MSIE|Trident/i) ? "IE" : "Other";

  const browserVersion =
    ua.match(/Edg\/(\d+[\d.]*)/i)?.[1] ||
    ua.match(/OPR\/(\d+[\d.]*)/i)?.[1] ||
    ua.match(/(?:Chrome|CriOS|Firefox|FxiOS|Version)\/(\d+[\d.]*)/i)?.[1] || null;

  const os =
    ua.match(/Windows/i) ? "Windows" :
    ua.match(/Mac OS X|macOS/i) ? "macOS" :
    ua.match(/CrOS/i) ? "ChromeOS" :
    ua.match(/Android/i) ? "Android" :
    ua.match(/iPhone|iPad|iPod/i) ? "iOS" :
    ua.match(/Linux/i) ? "Linux" : "Other";

  const osVersion =
    ua.match(/Windows NT (\d+[\d.]*)/i)?.[1] ||
    ua.match(/Mac OS X (\d+[_\d.]*)/i)?.[1]?.replace(/_/g, ".") ||
    ua.match(/Android (\d+[\d.]*)/i)?.[1] ||
    ua.match(/(?:iPhone|iPad|iPod) OS (\d+[_\d.]*)/i)?.[1]?.replace(/_/g, ".") || null;

  const isMobile = /Mobile|Android|iPhone|iPod/i.test(ua);
  const isTablet = /iPad|Tablet|Android(?!.*Mobile)/i.test(ua);
  const deviceType = isTablet ? "tablet" : isMobile ? "mobile" : "desktop";

  return { browser, browserVersion, os, osVersion, deviceType };
}

/** Simplified parseUA for quick link redirects (no version info needed) */
export function parseUASimple(ua: string) {
  const browser =
    ua.match(/Edg\//i) ? "Edge" :
    ua.match(/OPR\//i) ? "Opera" :
    ua.match(/(?:Chrome|CriOS)\//i) && !ua.match(/Edg\//i) ? "Chrome" :
    ua.match(/(?:Firefox|FxiOS)\//i) ? "Firefox" :
    ua.match(/Safari\//i) && !ua.match(/Chrome/i) ? "Safari" : "Other";
  const os =
    ua.match(/Windows/i) ? "Windows" :
    ua.match(/Mac OS X|macOS/i) ? "macOS" :
    ua.match(/Android/i) ? "Android" :
    ua.match(/iPhone|iPad|iPod/i) ? "iOS" :
    ua.match(/Linux/i) ? "Linux" : "Other";
  const isMobile = /Mobile|Android|iPhone|iPod/i.test(ua);
  const isTablet = /iPad|Tablet|Android(?!.*Mobile)/i.test(ua);
  return { browser, os, deviceType: isTablet ? "tablet" : isMobile ? "mobile" : "desktop" };
}
