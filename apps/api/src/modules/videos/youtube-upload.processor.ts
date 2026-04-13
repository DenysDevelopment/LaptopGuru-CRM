import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { YouTubeUploadService } from './youtube-upload.service';

function getNextPTMidnight(): Date {
	const now = new Date();
	// Pacific Time is UTC-7 (PDT) or UTC-8 (PST)
	const ptOffset = -7; // PDT
	const utcHour = now.getUTCHours();
	const ptHour = (utcHour + ptOffset + 24) % 24;

	const next = new Date(now);
	if (ptHour >= 0) {
		next.setUTCDate(next.getUTCDate() + 1);
	}
	next.setUTCHours(-ptOffset, 1, 0, 0); // 00:01 PT
	return next;
}

@Processor('youtube-upload')
export class YouTubeUploadProcessor extends WorkerHost {
	private readonly logger = new Logger(YouTubeUploadProcessor.name);

	constructor(
		private readonly prisma: PrismaService,
		private readonly youtubeUploadService: YouTubeUploadService,
	) {
		super();
	}

	async process(job: Job<{ videoId: string }>): Promise<void> {
		if (!this.youtubeUploadService.isConfigured()) {
			this.logger.debug('YouTube OAuth not configured, skipping upload');
			return;
		}

		const video = await this.prisma.video.findUnique({
			where: { id: job.data.videoId },
		});
		if (!video || !video.s3KeyOriginal) return;
		if (video.youtubeUploadStatus === 'uploaded') return;

		// User opted out after the job was queued
		if (!video.publishToYoutube) {
			await this.prisma.video.update({
				where: { id: video.id },
				data: { youtubeUploadStatus: null },
			});
			return;
		}

		try {
			const youtubeId = await this.youtubeUploadService.uploadVideo({
				s3KeyOriginal: video.s3KeyOriginal,
				title: video.title,
				description: `Developed with 💛 by Denys`,
			});

			await this.prisma.video.update({
				where: { id: video.id },
				data: { youtubeId, youtubeUploadStatus: 'uploaded' },
			});
		} catch (err: any) {
			const isQuota = err.errors?.some(
				(e: any) => e.reason === 'quotaExceeded',
			);

			if (isQuota) {
				const nextMidnightPT = getNextPTMidnight();
				await this.prisma.video.update({
					where: { id: video.id },
					data: {
						youtubeUploadStatus: 'quota_exceeded',
						youtubeUploadError: 'YouTube API quota exceeded',
						youtubeQuotaRetryAt: nextMidnightPT,
					},
				});
				this.logger.warn(
					`Video ${video.id}: YouTube quota exceeded, retry at ${nextMidnightPT.toISOString()}`,
				);
			} else {
				await this.prisma.video.update({
					where: { id: video.id },
					data: {
						youtubeUploadStatus: 'failed',
						youtubeUploadError: err.message || 'Unknown error',
					},
				});
				throw err; // BullMQ retries up to 3 times
			}
		}
	}
}
