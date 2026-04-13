import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSend = vi.fn();

vi.mock('@aws-sdk/client-s3', () => {
  class MockS3Client {
    send = mockSend;
  }
  return {
    S3Client: MockS3Client,
    HeadObjectCommand: class { input: any; constructor(input: any) { this.input = input; } },
    DeleteObjectCommand: class { input: any; constructor(input: any) { this.input = input; } },
    ListObjectsV2Command: class { input: any; constructor(input: any) { this.input = input; } },
    GetObjectCommand: class { input: any; constructor(input: any) { this.input = input; } },
  };
});

const mockCreatePresignedPost = vi.fn();
vi.mock('@aws-sdk/s3-presigned-post', () => ({
  createPresignedPost: (...args: any[]) => mockCreatePresignedPost(...args),
}));

import { S3Service } from './s3.service';

describe('S3Service', () => {
  let service: S3Service;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AWS_REGION = 'eu-central-1';
    process.env.AWS_S3_VIDEO_BUCKET = 'test-bucket';
    service = new S3Service();
  });

  describe('createPresignedPostUrl', () => {
    it('calls createPresignedPost with correct params', async () => {
      mockCreatePresignedPost.mockResolvedValue({
        url: 'https://test-bucket.s3.amazonaws.com',
        fields: { key: 'originals/c1/v1.mp4', 'Content-Type': 'video/mp4', policy: 'abc', 'X-Amz-Signature': 'sig' },
      });

      const result = await service.createPresignedPostUrl({
        key: 'originals/c1/v1.mp4',
        contentType: 'video/mp4',
        maxBytes: 2_147_483_648,
        ttlSeconds: 900,
      });

      expect(mockCreatePresignedPost).toHaveBeenCalledOnce();
      const callArgs = mockCreatePresignedPost.mock.calls[0];
      const options = callArgs[1];

      expect(options.Bucket).toBe('test-bucket');
      expect(options.Key).toBe('originals/c1/v1.mp4');
      expect(options.Expires).toBe(900);
      expect(options.Conditions).toEqual([
        ['content-length-range', 1, 2_147_483_648],
        ['eq', '$Content-Type', 'video/mp4'],
      ]);
      expect(options.Fields).toEqual({ 'Content-Type': 'video/mp4' });

      expect(result.url).toContain('test-bucket');
      expect(result.fields.key).toBe('originals/c1/v1.mp4');
    });
  });

  describe('headObject', () => {
    it('sends HeadObjectCommand with correct bucket and key', async () => {
      mockSend.mockResolvedValue({ ContentLength: 12345 });
      const result = await service.headObject('originals/c1/v1.mp4');

      expect(mockSend).toHaveBeenCalledOnce();
      const cmd = mockSend.mock.calls[0][0];
      expect(cmd.input.Bucket).toBe('test-bucket');
      expect(cmd.input.Key).toBe('originals/c1/v1.mp4');
      expect(result.ContentLength).toBe(12345);
    });
  });

  describe('deleteObject', () => {
    it('sends DeleteObjectCommand', async () => {
      mockSend.mockResolvedValue({});
      await service.deleteObject('originals/c1/v1.mp4');

      expect(mockSend).toHaveBeenCalledOnce();
      const cmd = mockSend.mock.calls[0][0];
      expect(cmd.input.Key).toBe('originals/c1/v1.mp4');
    });
  });

  describe('deleteRecursive', () => {
    it('lists and deletes all objects under prefix', async () => {
      mockSend
        .mockResolvedValueOnce({
          Contents: [{ Key: 'outputs/c1/v1/video.mp4' }, { Key: 'outputs/c1/v1/thumb.jpg' }],
          NextContinuationToken: undefined,
        })
        .mockResolvedValue({}); // delete calls

      await service.deleteRecursive('outputs/c1/v1/');

      // 1 list + 2 deletes = 3 calls
      expect(mockSend).toHaveBeenCalledTimes(3);
    });

    it('handles pagination', async () => {
      mockSend
        // First page
        .mockResolvedValueOnce({
          Contents: [{ Key: 'outputs/c1/v1/video.mp4' }],
          NextContinuationToken: 'token1',
        })
        .mockResolvedValueOnce({}) // delete first file
        // Second page
        .mockResolvedValueOnce({
          Contents: [{ Key: 'outputs/c1/v1/thumb.jpg' }],
          NextContinuationToken: undefined,
        })
        .mockResolvedValueOnce({}); // delete second file

      await service.deleteRecursive('outputs/c1/v1/');

      // 2 lists + 2 deletes = 4 calls
      expect(mockSend).toHaveBeenCalledTimes(4);
    });
  });
});
