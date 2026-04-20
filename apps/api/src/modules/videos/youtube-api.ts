import {
  BadRequestException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';

export interface YouTubeVideoInfo {
  youtubeId: string;
  title: string;
  thumbnail: string;
  duration: string | null;
  channelTitle: string | null;
}

export interface YouTubeChannelInfo {
  handle: string;
  title: string;
  thumbnail: string;
}

export function extractYoutubeId(input: string): string | null {
  if (/^[a-zA-Z0-9_-]{11}$/.test(input.trim())) {
    return input.trim();
  }

  const pattern =
    /(?:youtube\.com\/watch\?.*v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/;
  const match = input.match(pattern);
  return match ? match[1] : null;
}

/** Extract a clean @handle from a handle string or YouTube channel URL. */
export function normalizeChannelHandle(input: string): string {
  const trimmed = input.trim();
  if (/^@[\w.-]+$/.test(trimmed)) return trimmed;
  const handleMatch = trimmed.match(/(?:youtube\.com\/)(@[\w.-]+)/);
  if (handleMatch) return handleMatch[1];
  if (/^[\w.-]+$/.test(trimmed)) return `@${trimmed}`;
  throw new BadRequestException('Invalid YouTube channel handle or URL');
}

function getApiKey(): string {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) throw new InternalServerErrorException('YOUTUBE_API_KEY not configured');
  return apiKey;
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

export async function fetchChannelVideos(handle: string): Promise<YouTubeVideoInfo[]> {
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

export async function fetchVideoInfo(youtubeId: string): Promise<YouTubeVideoInfo> {
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

export async function fetchChannelInfo(handle: string): Promise<YouTubeChannelInfo> {
  const apiKey = getApiKey();
  const clean = handle.startsWith('@') ? handle : `@${handle}`;
  const url = `https://www.googleapis.com/youtube/v3/channels?part=snippet,contentDetails&forHandle=${encodeURIComponent(clean)}&key=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) throw new InternalServerErrorException(`YouTube API error: ${res.status}`);
  const data = await res.json();
  if (!data.items?.length) throw new NotFoundException(`YouTube channel not found: ${clean}`);
  const item = data.items[0];
  return {
    handle: clean,
    title: item.snippet.title,
    thumbnail: item.snippet.thumbnails?.default?.url || '',
  };
}
