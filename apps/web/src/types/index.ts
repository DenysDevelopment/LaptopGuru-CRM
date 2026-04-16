// Incoming emails
export interface IncomingEmail {
  id: string;
  messageId: string;
  from: string;
  subject: string;
  body: string;
  productUrl: string | null;
  productName: string | null;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  customerLang: string | null;
  category: string;
  receivedAt: string;
  processed: boolean;
  archived: boolean;
}

export interface SentEmail {
  id: string;
  to: string;
  subject: string;
  status: string;
  sentAt: string;
  errorMessage?: string | null;
}

export interface SentEmailWithDetails extends SentEmail {
  landing: {
    slug: string;
    title: string;
    video: { title: string };
  };
  sentBy: { name: string | null; email: string };
}

export interface Landing {
  id: string;
  slug: string;
  title: string;
  views: number;
  clicks: number;
  createdAt: string;
  video: { title: string; thumbnail: string } | null;
  sentEmails: SentEmail[];
}

export interface EmailDetail extends IncomingEmail {
  landings: Landing[];
}

export interface ThreadData {
  emails: IncomingEmail[];
  landings: Landing[];
}

export type TimelineItem =
  | { type: "incoming"; date: string; data: IncomingEmail }
  | { type: "sent"; date: string; data: SentEmail & { videoTitle: string } }
  | { type: "landing"; date: string; data: Landing }
  | { type: "reply"; date: string; data: { subject: string; to: string; body: string } };

export interface Video {
  id: string;
  source: 'YOUTUBE' | 'S3';
  status: 'UPLOADING' | 'PROCESSING' | 'READY' | 'FAILED';
  youtubeId: string | null;
  title: string;
  thumbnail: string;
  duration: string | null;
  durationSeconds: number | null;
  channelTitle?: string | null;
  youtubeUploadStatus?: string | null;
  s3KeyOutput?: string | null;
  cloudFrontThumbUrl?: string | null;
  fileSize?: number | null;
  createdAt?: string;
}

export interface QuickLinkVisit {
  id: string;
  visitedAt: string;
  ip: string | null;
  country: string | null;
  city: string | null;
  browser: string | null;
  os: string | null;
  deviceType: string | null;
  referrerDomain: string | null;
}

export interface QuickLink {
  id: string;
  slug: string;
  targetUrl: string;
  name: string | null;
  clicks: number;
  createdAt: string;
  _count: { visits: number };
  visits: QuickLinkVisit[];
}

export type Filter = "all" | "new" | "processed" | "archived";
export type Category = "all" | "lead" | "other";

export interface PaginatedResponse<T> {
  emails: T[];
  total: number;
  page: number;
  totalPages: number;
}

export const filterLabels: Record<Filter, string> = {
  all: "Все",
  new: "Новые",
  processed: "Обработанные",
  archived: "Архив",
};

export const categoryLabels: Record<Category, string> = {
  all: "Все",
  lead: "Заявки",
  other: "Прочие",
};
