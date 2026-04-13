export interface VideoAnalyticsOverview {
  totalViews: number;
  uniqueViewers: number;
  totalWatchTime: number;
  avgViewDuration: number;
  completionRate: number;
  playRate: number;
}

export interface VideoRetentionPoint {
  second: number;
  viewers: number;
  viewersPercent: number;
}

export interface VideoAnalyticsData {
  overview: VideoAnalyticsOverview;
  retention: VideoRetentionPoint[];
  dropOffPoints: { second: number; dropPercent: number }[];
  viewsTimeSeries: { date: string; views: number }[];
  replayHeatmap: { second: number; replays: number }[];
  geography: { country: string; views: number }[];
  devices: { deviceType: string; views: number }[];
  browsers: { browser: string; views: number }[];
  os: { os: string; views: number }[];
  referrers: { referrerDomain: string; views: number }[];
  playbackSpeeds: { rate: number; count: number }[];
  recentWatches: {
    sessionId: string;
    startedAt: string;
    duration: number;
    completed: boolean;
    country: string | null;
    device: string | null;
    browser: string | null;
  }[];
}
