'use client';

import { useCallback, useRef, useState } from 'react';
import { VideoUploadModal } from './video-upload-modal';

const MAX_BYTES = 2_147_483_648; // 2 GB

// Landing pages render videos inside a fixed 9:16 frame; anything off-ratio
// gets letterboxed or cropped, which looks bad. Reject on upload instead.
const EXPECTED_ASPECT = 9 / 16; // 0.5625
const ASPECT_TOLERANCE = 0.05; // accept roughly 0.51 – 0.61 (covers iPhone, Samsung, GoPro portrait)

function readVideoDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    const cleanup = () => URL.revokeObjectURL(url);
    video.onloadedmetadata = () => {
      const width = video.videoWidth;
      const height = video.videoHeight;
      cleanup();
      if (!width || !height) {
        reject(new Error('Не удалось прочитать размеры видео'));
        return;
      }
      resolve({ width, height });
    };
    video.onerror = () => {
      cleanup();
      reject(new Error('Не удалось прочитать метаданные видео'));
    };
    video.src = url;
  });
}

interface Props {
  onUploadComplete: () => void;
}

export function VideoUploader({ onUploadComplete }: Props) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [videoId, setVideoId] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [fileSize, setFileSize] = useState(0);
  const [defaultTitle, setDefaultTitle] = useState('');

  const handleFile = useCallback(async (file: File) => {
    setError('');

    if (!file.type.startsWith('video/')) {
      setError('Только видеофайлы');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError('Максимальный размер — 2 GB');
      return;
    }

    // Verify portrait 9:16 aspect ratio before we waste time uploading.
    try {
      const { width, height } = await readVideoDimensions(file);
      const aspect = width / height;
      if (Math.abs(aspect - EXPECTED_ASPECT) > ASPECT_TOLERANCE) {
        setError(
          `Видео должно быть вертикальным (9:16). Загруженное: ${width}×${height}.`,
        );
        return;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось проверить формат');
      return;
    }

    const title = file.name.replace(/\.[^.]+$/, '');

    setUploading(true);
    setProgress(0);
    setFileName(file.name);
    setFileSize(file.size);
    setDefaultTitle(title);

    try {
      // Step 1: get presigned PUT URL
      const initRes = await fetch('/api/videos/upload-init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type,
          title,
          publishToYoutube: false,
        }),
      });

      if (!initRes.ok) {
        const data = await initRes.json().catch(() => ({}));
        throw new Error(data.error || 'Upload init failed');
      }

      const initData = await initRes.json().catch(() => null);
      if (!initData?.videoId || !initData?.putUrl) {
        throw new Error('Invalid response from server');
      }
      const { videoId: vid, putUrl } = initData;
      setVideoId(vid);
      setModalOpen(true);

      // Step 2: upload to S3 via presigned PUT
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', putUrl, true);
        xhr.setRequestHeader('Content-Type', file.type);

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            setProgress(Math.round((e.loaded / e.total) * 100));
          }
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error(`S3 upload failed: ${xhr.status}`));
          }
        };
        xhr.onerror = () => reject(new Error('Network error during upload'));
        xhr.send(file);
      });

      // Step 3: confirm upload
      const completeRes = await fetch('/api/videos/upload-complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId: vid }),
      });

      if (!completeRes.ok) {
        const data = await completeRes.json();
        throw new Error(data.error || 'Upload complete failed');
      }

      onUploadComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }, [onUploadComplete]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const onFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  }, [handleFile]);

  function handleModalClose() {
    setModalOpen(false);
  }

  function handleModalSaved() {
    setModalOpen(false);
    onUploadComplete();
  }

  return (
    <div className="mb-6">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => !uploading && fileInputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
          dragging
            ? 'border-brand bg-brand/5'
            : 'border-gray-200 hover:border-gray-300'
        } ${uploading ? 'pointer-events-none opacity-70' : ''}`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          onChange={onFileSelect}
          className="hidden"
        />

        {uploading ? (
          <div>
            <p className="text-sm text-gray-600 mb-2">Загрузка видео... {progress}%</p>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-brand h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        ) : (
          <div>
            <p className="text-sm text-gray-600">
              Перетащите видео сюда или нажмите для выбора
            </p>
            <p className="text-xs text-gray-400 mt-1">MP4, WebM, MOV — до 2 GB</p>
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-500 mt-2">{error}</p>}

      {modalOpen && videoId && (
        <VideoUploadModal
          videoId={videoId}
          fileName={fileName}
          fileSize={fileSize}
          progress={progress}
          uploading={uploading}
          defaultTitle={defaultTitle}
          onClose={handleModalClose}
          onSaved={handleModalSaved}
        />
      )}
    </div>
  );
}
