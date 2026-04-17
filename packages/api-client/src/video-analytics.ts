import type { VideoAnalyticsData, VisitPlaybackData } from '@laptopguru-crm/shared';
import { customFetch } from './fetcher';

export const videoAnalytics = {
  getAnalytics: (videoId: string, from?: string, to?: string) =>
    customFetch<VideoAnalyticsData>({
      url: `/api/videos/${videoId}/analytics`,
      method: 'GET',
      params: {
        ...(from ? { from } : {}),
        ...(to ? { to } : {}),
      },
    }),
  getVisitPlayback: (slug: string, visitId: string) =>
    customFetch<VisitPlaybackData>({
      url: `/api/landings/${slug}/visits/${visitId}/playback`,
      method: 'GET',
    }),
};
