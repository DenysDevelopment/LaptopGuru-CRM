import { getSignedUrl } from '@aws-sdk/cloudfront-signer';

let cachedPem: string | null = null;

function getPrivateKey(): string {
  if (cachedPem) return cachedPem;
  const base64 = process.env.AWS_CLOUDFRONT_PRIVATE_KEY_BASE64;
  if (!base64) throw new Error('AWS_CLOUDFRONT_PRIVATE_KEY_BASE64 not set');
  cachedPem = Buffer.from(base64, 'base64').toString('utf-8');
  return cachedPem;
}

export function signVideoUrl(s3KeyOutput: string, ttlSeconds = 14400): string {
  const domain = process.env.AWS_CLOUDFRONT_DOMAIN;
  if (!domain) throw new Error('AWS_CLOUDFRONT_DOMAIN not set');

  const url = `https://${domain}/${s3KeyOutput}`;
  return getSignedUrl({
    url,
    keyPairId: process.env.AWS_CLOUDFRONT_KEY_PAIR_ID!,
    dateLessThan: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
    privateKey: getPrivateKey(),
  });
}
