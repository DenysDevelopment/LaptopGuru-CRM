'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { CheckCircle2, X } from 'lucide-react';

interface Props {
  videoId: string;
  fileName: string;
  fileSize: number;
  progress: number;
  uploading: boolean;
  defaultTitle: string;
  onClose: () => void;
  onSaved: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function VideoUploadModal({
  videoId,
  fileName,
  fileSize,
  progress,
  uploading,
  defaultTitle,
  onClose,
  onSaved,
}: Props) {
  const [title, setTitle] = useState(defaultTitle);
  const [publishToYoutube] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    setSaving(true);
    setError('');

    try {
      const res = await fetch(`/api/videos/${videoId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim() || defaultTitle, publishToYoutube }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Ошибка сохранения');
      }

      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  }

  const uploadDone = !uploading && progress >= 100;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-900">
            Загрузка видео
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* File info */}
        <div className="text-sm text-gray-500 mb-1 truncate">{fileName}</div>
        <div className="text-xs text-gray-400 mb-3">{formatBytes(fileSize)}</div>

        {/* Progress */}
        <div className="mb-5">
          {uploadDone ? (
            <div className="flex items-center gap-2 text-sm text-green-600">
              <CheckCircle2 className="w-4 h-4" />
              Загружено
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between text-sm text-gray-600 mb-1">
                <span>Загрузка...</span>
                <span>{progress}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-brand h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </>
          )}
        </div>

        {/* Title */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Название
          </label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Введите название видео"
          />
        </div>

        {/* YouTube checkbox — disabled until OAuth is configured */}
        <label className="flex items-center gap-2 mb-5 cursor-not-allowed opacity-50">
          <Checkbox
            checked={publishToYoutube}
            disabled
          />
          <span className="text-sm text-gray-500">Опубликовать на YouTube (скоро)</span>
        </label>

        {/* Error */}
        {error && (
          <div className="bg-red-50 text-red-600 text-sm rounded-lg px-3 py-2 mb-4">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <Button
            type="button"
            onClick={onClose}
            variant="outline"
            className="flex-1"
          >
            Закрыть
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 bg-brand hover:bg-brand-hover text-white"
          >
            {saving ? 'Сохранение...' : 'Сохранить'}
          </Button>
        </div>
      </div>
    </div>
  );
}
