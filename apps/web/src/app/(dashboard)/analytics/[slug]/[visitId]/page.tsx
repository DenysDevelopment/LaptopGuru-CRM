'use client';

import { use, useEffect, useState } from 'react';
import type { VisitPlaybackData } from '@laptopguru-crm/shared';
import { SessionTimeline } from './session-timeline';

export default function VisitDrilldownPage({
  params,
}: {
  params: Promise<{ slug: string; visitId: string }>;
}) {
  const { slug, visitId } = use(params);
  const [data, setData] = useState<VisitPlaybackData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/landings/${slug}/visits/${visitId}/playback`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d: VisitPlaybackData) => setData(d))
      .catch((e: Error) => setError(e.message));
  }, [slug, visitId]);

  if (error) return <div className="p-6 text-red-600">Ошибка: {error}</div>;
  if (!data) return <div className="p-6">Загрузка...</div>;

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Аналитика</h1>
      {data.sessions.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Нет сессий воспроизведения — зритель ещё не запускал видео на этом визите.
        </p>
      )}
      {data.sessions.map((s) => (
        <SessionTimeline key={s.sessionId} session={s} />
      ))}
    </div>
  );
}
