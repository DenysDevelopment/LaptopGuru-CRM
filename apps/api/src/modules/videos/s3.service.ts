import { Injectable, Logger } from '@nestjs/common';
import {
  S3Client,
  HeadObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { createPresignedPost, type PresignedPost } from '@aws-sdk/s3-presigned-post';
import type { Readable } from 'stream';

@Injectable()
export class S3Service {
  private readonly logger = new Logger(S3Service.name);
  private readonly s3: S3Client;
  private readonly bucket: string;

  constructor() {
    this.s3 = new S3Client({ region: process.env.AWS_REGION || 'eu-central-1' });
    this.bucket = process.env.AWS_S3_VIDEO_BUCKET || 'shorterlink-videos-eu-central-1';
  }

  async createPresignedPostUrl(opts: {
    key: string;
    contentType: string;
    maxBytes: number;
    ttlSeconds: number;
  }): Promise<PresignedPost> {
    return createPresignedPost(this.s3, {
      Bucket: this.bucket,
      Key: opts.key,
      Conditions: [
        ['content-length-range', 1, opts.maxBytes],
        ['eq', '$Content-Type', opts.contentType],
      ],
      Fields: { 'Content-Type': opts.contentType },
      Expires: opts.ttlSeconds,
    });
  }

  async headObject(key: string) {
    return this.s3.send(
      new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }

  async deleteObject(key: string) {
    await this.s3.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }

  async deleteRecursive(prefix: string) {
    let continuationToken: string | undefined;
    do {
      const list = await this.s3.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );
      for (const obj of list.Contents || []) {
        if (obj.Key) {
          await this.s3.send(
            new DeleteObjectCommand({ Bucket: this.bucket, Key: obj.Key }),
          );
        }
      }
      continuationToken = list.NextContinuationToken;
    } while (continuationToken);
  }

  async getObjectStream(key: string): Promise<{ stream: Readable; contentLength: number }> {
    const res = await this.s3.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    return {
      stream: res.Body as Readable,
      contentLength: Number(res.ContentLength ?? 0),
    };
  }
}
