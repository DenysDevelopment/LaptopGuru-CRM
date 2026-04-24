import { getSignedUrl } from '@aws-sdk/cloudfront-signer';

let cachedPem: string | null = null;

function getPrivateKey(): string {
  if (cachedPem) return cachedPem;
  const base64 = process.env.AWS_CLOUDFRONT_PRIVATE_KEY_BASE64;
  if (!base64) throw new Error('AWS_CLOUDFRONT_PRIVATE_KEY_BASE64 not set');
  cachedPem = Buffer.from(base64, 'base64').toString('utf-8');
  return cachedPem;
}

// Round expiry up to the next 1-hour boundary so signed URLs are byte-stable
// within each hour — browsers and next/image can cache them instead of seeing
// a fresh URL on every request. Signature keeps validity for at least
// ttlSeconds (up to ttlSeconds + 1h).
const BUCKET_SECONDS = 3600;

export function signVideoUrl(s3KeyOutput: string, ttlSeconds = 14400): string | null {
  const domain = process.env.AWS_CLOUDFRONT_DOMAIN;
  const keyPairId = process.env.AWS_CLOUDFRONT_KEY_PAIR_ID;
  if (!domain || !keyPairId || !process.env.AWS_CLOUDFRONT_PRIVATE_KEY_BASE64) return null;

  try {
    const url = `https://${domain}/${s3KeyOutput}`;
    const nowSec = Math.floor(Date.now() / 1000);
    const expSec = Math.ceil(nowSec / BUCKET_SECONDS) * BUCKET_SECONDS + ttlSeconds;
    return getSignedUrl({
      url,
      keyPairId,
      dateLessThan: new Date(expSec * 1000).toISOString(),
      privateKey: getPrivateKey(),
    });
  } catch {
    return null;
  }
}
