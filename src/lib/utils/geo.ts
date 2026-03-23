export interface GeoData {
  country: string | null;
  countryCode: string | null;
  city: string | null;
  region: string | null;
  timezone: string | null;
  lat: number | null;
  lon: number | null;
  isp: string | null;
  org: string | null;
  asNumber: string | null;
}

const emptyGeo: GeoData = {
  country: null, countryCode: null, city: null, region: null,
  timezone: null, lat: null, lon: null, isp: null, org: null, asNumber: null,
};

/** Full geolocation with all available fields */
export async function geolocate(ip: string): Promise<GeoData> {
  if (!ip || ip === "127.0.0.1" || ip === "::1") return emptyGeo;
  try {
    const res = await fetch(
      `http://ip-api.com/json/${ip}?fields=country,countryCode,city,regionName,timezone,lat,lon,isp,org,as`,
      { signal: AbortSignal.timeout(3000) }
    );
    if (!res.ok) return emptyGeo;
    const d = await res.json();
    return {
      country: d.country || null,
      countryCode: d.countryCode || null,
      city: d.city || null,
      region: d.regionName || null,
      timezone: d.timezone || null,
      lat: d.lat ?? null,
      lon: d.lon ?? null,
      isp: d.isp || null,
      org: d.org || null,
      asNumber: d.as || null,
    };
  } catch {
    return emptyGeo;
  }
}

/** Simplified geolocation (country + city only) for quick link redirects */
export async function geolocateSimple(ip: string): Promise<{ country: string | null; city: string | null }> {
  if (!ip || ip === "127.0.0.1" || ip === "::1") return { country: null, city: null };
  try {
    const res = await fetch(
      `http://ip-api.com/json/${ip}?fields=country,city`,
      { signal: AbortSignal.timeout(2000) }
    );
    if (!res.ok) return { country: null, city: null };
    const d = await res.json();
    return { country: d.country || null, city: d.city || null };
  } catch {
    return { country: null, city: null };
  }
}
