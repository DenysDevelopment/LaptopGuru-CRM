import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the AWS SDK before importing the service
vi.mock('@aws-sdk/cloudfront-signer', () => ({
  getSignedUrl: vi.fn(({ url, keyPairId }) =>
    `${url}?Key-Pair-Id=${keyPairId}&Signature=FAKE_SIG&Expires=9999999999`,
  ),
}));

import { CloudFrontSignerService } from './cloudfront-signer.service';

describe('CloudFrontSignerService', () => {
  let service: CloudFrontSignerService;

  beforeEach(() => {
    process.env.AWS_CLOUDFRONT_DOMAIN = 'cdn.test.example';
    process.env.AWS_CLOUDFRONT_KEY_PAIR_ID = 'KTESTKEY123';
    process.env.AWS_CLOUDFRONT_PRIVATE_KEY_BASE64 = Buffer.from('-----BEGIN RSA PRIVATE KEY-----\nfake\n-----END RSA PRIVATE KEY-----').toString('base64');
    process.env.CLOUDFRONT_SIGNED_URL_TTL_SECONDS = '14400';
    service = new CloudFrontSignerService();
  });

  describe('signVideoUrl', () => {
    it('returns URL with CloudFront domain and signing params', () => {
      const url = service.signVideoUrl('outputs/c1/v1/video.mp4');

      expect(url).toContain('https://cdn.test.example/outputs/c1/v1/video.mp4');
      expect(url).toContain('Key-Pair-Id=KTESTKEY123');
      expect(url).toContain('Signature=');
      expect(url).toContain('Expires=');
    });

    it('constructs correct base URL from s3Key', () => {
      const url = service.signVideoUrl('outputs/company-abc/video-xyz/video.mp4');
      expect(url).toMatch(/^https:\/\/cdn\.test\.example\/outputs\/company-abc\/video-xyz\/video\.mp4/);
    });
  });

  describe('getPublicThumbUrl', () => {
    it('returns unsigned public URL', () => {
      const url = service.getPublicThumbUrl('outputs/c1/v1/thumb.0000000.jpg');
      expect(url).toBe('https://cdn.test.example/outputs/c1/v1/thumb.0000000.jpg');
      expect(url).not.toContain('Signature');
    });
  });
});
