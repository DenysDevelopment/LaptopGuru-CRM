import {
  Injectable,
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ClsService } from 'nestjs-cls';

/* ------------------------------------------------------------------ */
/*  YouTube helpers (ported from apps/web/src/lib/youtube.ts)          */
/* ------------------------------------------------------------------ */

interface YouTubeVideoInfo {
  youtubeId: string;
  title: string;
  thumbnail: string;
  duration: string | null;
  channelTitle: string | null;
}

function extractYoutubeId(input: string): string | null {
  if (/^[a-zA-Z0-9_-]{11}$/.test(input.trim())) {
    return input.trim();
  }

  const pattern =
    /(?:youtube\.com\/watch\?.*v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/;
  const match = input.match(pattern);
  return match ? match[1] : null;
}

function parseDuration(iso: string): string {
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return '0:00';

  const hours = parseInt(match[1] || '0');
  const minutes = parseInt(match[2] || '0');
  const seconds = parseInt(match[3] || '0');

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function getApiKey(): string {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) throw new InternalServerErrorException('YOUTUBE_API_KEY not configured');
  return apiKey;
}

async function resolveChannelUploadsPlaylist(handle: string): Promise<string> {
  const apiKey = getApiKey();
  const clean = handle.startsWith('@') ? handle : `@${handle}`;
  const url = `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&forHandle=${encodeURIComponent(clean)}&key=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) throw new InternalServerErrorException(`YouTube API error: ${res.status}`);
  const data = await res.json();
  if (!data.items?.length) throw new BadRequestException(`Channel not found: ${clean}`);
  return data.items[0].contentDetails.relatedPlaylists.uploads;
}

async function fetchVideosBatch(ids: string[]): Promise<YouTubeVideoInfo[]> {
  if (ids.length === 0) return [];
  const apiKey = getApiKey();
  const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${ids.join(',')}&key=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) throw new InternalServerErrorException(`YouTube API error: ${res.status}`);
  const data = await res.json();

  return (data.items || []).map((item: any) => ({
    youtubeId: item.id as string,
    title: item.snippet.title,
    thumbnail:
      item.snippet.thumbnails?.maxres?.url ||
      item.snippet.thumbnails?.high?.url ||
      `https://img.youtube.com/vi/${item.id}/hqdefault.jpg`,
    duration: item.contentDetails?.duration
      ? parseDuration(item.contentDetails.duration)
      : null,
    channelTitle: item.snippet.channelTitle || null,
  }));
}

async function fetchChannelVideos(handle: string): Promise<YouTubeVideoInfo[]> {
  const apiKey = getApiKey();
  const uploadsPlaylistId = await resolveChannelUploadsPlaylist(handle);

  const videoIds: string[] = [];
  let nextPageToken: string | undefined;

  do {
    const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${uploadsPlaylistId}&maxResults=50&key=${apiKey}${nextPageToken ? `&pageToken=${nextPageToken}` : ''}`;
    const res = await fetch(url);
    if (!res.ok) throw new InternalServerErrorException(`YouTube API error: ${res.status}`);
    const data = await res.json();

    for (const item of data.items || []) {
      const videoId = item.snippet?.resourceId?.videoId;
      if (videoId) videoIds.push(videoId);
    }

    nextPageToken = data.nextPageToken;
  } while (nextPageToken);

  const allVideos: YouTubeVideoInfo[] = [];
  for (let i = 0; i < videoIds.length; i += 50) {
    const batch = videoIds.slice(i, i + 50);
    const videos = await fetchVideosBatch(batch);
    allVideos.push(...videos);
  }

  return allVideos;
}

async function fetchVideoInfo(youtubeId: string): Promise<YouTubeVideoInfo> {
  const apiKey = getApiKey();
  const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${youtubeId}&key=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) throw new InternalServerErrorException(`YouTube API error: ${res.status}`);
  const data = await res.json();
  if (!data.items?.length) throw new NotFoundException('Video not found on YouTube');

  const item = data.items[0];
  return {
    youtubeId,
    title: item.snippet.title,
    thumbnail:
      item.snippet.thumbnails?.maxres?.url ||
      item.snippet.thumbnails?.high?.url ||
      `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`,
    duration: item.contentDetails?.duration
      ? parseDuration(item.contentDetails.duration)
      : null,
    channelTitle: item.snippet.channelTitle || null,
  };
}

/* ------------------------------------------------------------------ */
/*  Service                                                           */
/* ------------------------------------------------------------------ */

@Injectable()
export class VideosService {
  private readonly logger = new Logger(VideosService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
  ) {}

  /** List all active videos for current company, newest first. */
  async findAll() {
    const companyId = this.cls.get<string>('companyId');
    return this.prisma.video.findMany({
      where: { active: true, companyId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Add a YouTube video by URL (or re-activate if soft-deleted). */
  async addVideo(url: string, userId: string) {
    const youtubeId = extractYoutubeId(url);
    if (!youtubeId) {
      throw new BadRequestException('Invalid YouTube URL');
    }

    const companyId = this.cls.get<string>('companyId');

    const existing = await this.prisma.video.findUnique({
      where: { youtubeId_companyId: { youtubeId, companyId } },
    });
    if (existing) {
      if (!existing.active) {
        return this.prisma.video.update({
          where: { id: existing.id },
          data: { active: true },
        });
      }
      throw new ConflictException('Video already added');
    }

    const info = await fetchVideoInfo(youtubeId);

    return this.prisma.video.create({
      data: {
        youtubeId: info.youtubeId,
        title: info.title,
        thumbnail: info.thumbnail,
        duration: info.duration,
        channelTitle: info.channelTitle,
        userId,
        companyId,
      },
    });
  }

  /** Soft-delete a video by setting active to false. */
  async remove(id: string) {
    const companyId = this.cls.get<string>('companyId');
    const video = await this.prisma.video.findUnique({ where: { id } });
    if (!video || video.companyId !== companyId) {
      throw new NotFoundException('Video not found');
    }

    await this.prisma.video.update({
      where: { id },
      data: { active: false },
    });
    return { ok: true };
  }

  /** Sync all videos from the configured YouTube channel. */
  async syncFromChannel(userId: string) {
    const handle = process.env.YOUTUBE_CHANNEL_HANDLE;
    if (!handle) {
      throw new InternalServerErrorException('YOUTUBE_CHANNEL_HANDLE not configured');
    }

    try {
      const videos = await fetchChannelVideos(handle);
      let imported = 0;

      const companyId = this.cls.get<string>('companyId');

      for (const video of videos) {
        const existing = await this.prisma.video.findUnique({
          where: { youtubeId_companyId: { youtubeId: video.youtubeId, companyId } },
        });

        if (existing) {
          if (!existing.active) {
            await this.prisma.video.update({
              where: { id: existing.id },
              data: { active: true },
            });
            imported++;
          }
          continue;
        }

        await this.prisma.video.create({
          data: {
            youtubeId: video.youtubeId,
            title: video.title,
            thumbnail: video.thumbnail,
            duration: video.duration,
            channelTitle: video.channelTitle,
            userId,
            companyId,
          },
        });
        imported++;
      }

      return { imported, total: videos.length };
    } catch (error) {
      this.logger.error('Video sync failed', error);
      throw new InternalServerErrorException('Video sync failed');
    }
  }
}
