import {
	DeleteObjectCommand,
	GetObjectCommand,
	HeadObjectCommand,
	ListObjectsV2Command,
	PutObjectCommand,
	S3Client,
} from '@aws-sdk/client-s3';
import {
	createPresignedPost,
	type PresignedPost,
} from '@aws-sdk/s3-presigned-post';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, Logger } from '@nestjs/common';
import type { Readable } from 'stream';

@Injectable()
export class S3Service {
	private readonly logger = new Logger(S3Service.name);
	private readonly s3: S3Client;
	private readonly bucket: string;

	constructor() {
		this.s3 = new S3Client({
			region: process.env.AWS_REGION || 'eu-central-1',
		});
		this.bucket = process.env.AWS_S3_VIDEO_BUCKET || 'laptopguru-videos-eu';
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

	async createPresignedPutUrl(opts: {
		key: string;
		contentType: string;
		ttlSeconds: number;
	}): Promise<string> {
		const command = new PutObjectCommand({
			Bucket: this.bucket,
			Key: opts.key,
			ContentType: opts.contentType,
		});
		return getSignedUrl(this.s3, command, { expiresIn: opts.ttlSeconds });
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

	async getObjectStream(
		key: string,
	): Promise<{ stream: Readable; contentLength: number }> {
		const res = await this.s3.send(
			new GetObjectCommand({ Bucket: this.bucket, Key: key }),
		);
		return {
			stream: res.Body as Readable,
			contentLength: Number(res.ContentLength ?? 0),
		};
	}
}
