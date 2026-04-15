// This file will export generated API client hooks after running `npm run generate`
// For now, re-export the fetcher for manual use
export { customFetch } from './fetcher';

// Generated hooks will be exported from here after running orval:
// export * from './generated';

import type { VideoAnalyticsData, VisitPlaybackData } from '@laptopguru-crm/shared';
import { customFetch } from './fetcher';

export const videoAnalytics = {
  getAnalytics(videoId: string, from?: string, to?: string) {
    const params: Record<string, string> = {};
    if (from) params.from = from;
    if (to) params.to = to;
    return customFetch<VideoAnalyticsData>({
      url: `/videos/${videoId}/analytics`,
      method: 'GET',
      params: Object.keys(params).length ? params : undefined,
    });
  },
};

export const landings = {
  getVisitPlayback(slug: string, visitId: string) {
    return customFetch<VisitPlaybackData>({
      url: `/landings/${slug}/visits/${visitId}/playback`,
      method: 'GET',
    });
  },
};
