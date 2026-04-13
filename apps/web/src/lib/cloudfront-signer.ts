import { getSignedUrl } from '@aws-sdk/cloudfront-signer';

let cachedPem: string | null = null;

function getPrivateKey(): string {
  if (cachedPem) return cachedPem;
  const base64 = process.env.AWS_CLOUDFRONT_PRIVATE_KEY_BASE64;
  if (!base64) throw new Error('AWS_CLOUDFRONT_PRIVATE_KEY_BASE64 not set');
  cachedPem = Buffer.from(base64, 'base64').toString('utf-8');
  return cachedPem;
}

export function signVideoUrl(s3KeyOutput: string, ttlSeconds = 14400): string | null {
  const domain = process.env.AWS_CLOUDFRONT_DOMAIN;
  const keyPairId = process.env.AWS_CLOUDFRONT_KEY_PAIR_ID;
  if (!domain || !keyPairId || !process.env.AWS_CLOUDFRONT_PRIVATE_KEY_BASE64) return null;

  try {
    const url = `https://${domain}/${s3KeyOutput}`;
    return getSignedUrl({
      url,
      keyPairId,
      dateLessThan: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
      privateKey: getPrivateKey(),
    });
  } catch {
    return null;
  }
}
