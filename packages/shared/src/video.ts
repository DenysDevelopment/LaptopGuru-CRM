export type VideoSource = 'YOUTUBE' | 'S3';
export type VideoStatus = 'UPLOADING' | 'PROCESSING' | 'READY' | 'FAILED';

export interface VideoDTO {
  id: string;
  source: VideoSource;
  status: VideoStatus;
  title: string;
  thumbnail: string;
  duration: string | null;
  durationSeconds: number | null;
  youtubeId: string | null;
  youtubeUploadStatus: string | null;
  s3KeyOutput: string | null;
  cloudFrontThumbUrl: string | null;
  createdAt: string;
}

export interface UploadInitRequest {
  fileName: string;
  fileSize: number;
  mimeType: string;
  title: string;
}

export interface UploadInitResponse {
  videoId: string;
  postUrl: string;
  formFields: Record<string, string>;
  key: string;
}
