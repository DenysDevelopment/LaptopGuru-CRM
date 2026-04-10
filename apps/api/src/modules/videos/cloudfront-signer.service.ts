import { Injectable } from '@nestjs/common';
import { getSignedUrl } from '@aws-sdk/cloudfront-signer';

@Injectable()
export class CloudFrontSignerService {
  private readonly domain: string;
  private readonly keyPairId: string;
  private readonly privateKeyPem: string;
  private readonly defaultTtl: number;

  constructor() {
    this.domain = process.env.AWS_CLOUDFRONT_DOMAIN || '';
    this.keyPairId = process.env.AWS_CLOUDFRONT_KEY_PAIR_ID || '';
    this.defaultTtl = Number(process.env.CLOUDFRONT_SIGNED_URL_TTL_SECONDS || 14400);

    const base64 = process.env.AWS_CLOUDFRONT_PRIVATE_KEY_BASE64 || '';
    this.privateKeyPem = base64 ? Buffer.from(base64, 'base64').toString('utf-8') : '';
  }

  signVideoUrl(s3KeyOutput: string, ttlSeconds?: number): string {
    const url = `https://${this.domain}/${s3KeyOutput}`;
    const dateLessThan = new Date(
      Date.now() + (ttlSeconds ?? this.defaultTtl) * 1000,
    ).toISOString();

    return getSignedUrl({
      url,
      keyPairId: this.keyPairId,
      dateLessThan,
      privateKey: this.privateKeyPem,
    });
  }

  getPublicThumbUrl(s3KeyThumb: string): string {
    return `https://${this.domain}/${s3KeyThumb}`;
  }
}
