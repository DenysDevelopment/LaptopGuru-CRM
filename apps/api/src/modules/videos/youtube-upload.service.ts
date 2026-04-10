import { Injectable, Logger } from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';
import { google } from 'googleapis';
import { S3Service } from './s3.service';

@Injectable()
export class YouTubeUploadService {
  private readonly logger = new Logger(YouTubeUploadService.name);
  private readonly oauth2Client: OAuth2Client;

  constructor(private readonly s3Service: S3Service) {
    this.oauth2Client = new OAuth2Client(
      process.env.YOUTUBE_OAUTH_CLIENT_ID,
      process.env.YOUTUBE_OAUTH_CLIENT_SECRET,
    );
    this.oauth2Client.setCredentials({
      refresh_token: process.env.YOUTUBE_OAUTH_REFRESH_TOKEN,
    });
  }

  isConfigured(): boolean {
    return !!(
      process.env.YOUTUBE_OAUTH_CLIENT_ID &&
      process.env.YOUTUBE_OAUTH_CLIENT_SECRET &&
      process.env.YOUTUBE_OAUTH_REFRESH_TOKEN
    );
  }

  async uploadVideo(opts: {
    s3KeyOriginal: string;
    title: string;
    description: string;
  }): Promise<string> {
    const { stream } = await this.s3Service.getObjectStream(opts.s3KeyOriginal);

    const yt = google.youtube({ version: 'v3', auth: this.oauth2Client });
    const res = await yt.videos.insert({
      part: ['snippet', 'status'],
      requestBody: {
        snippet: {
          title: opts.title,
          description: opts.description,
          categoryId: '22', // People & Blogs
        },
        status: {
          privacyStatus: process.env.YOUTUBE_DEFAULT_PRIVACY_STATUS || 'unlisted',
        },
      },
      media: { body: stream },
    });

    const videoId = res.data.id;
    if (!videoId) throw new Error('YouTube upload returned no video ID');

    this.logger.log(`YouTube upload complete: ${videoId}`);
    return videoId;
  }
}
