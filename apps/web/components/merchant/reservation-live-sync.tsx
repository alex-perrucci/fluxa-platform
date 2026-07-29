// PHASE_10_RESERVATION_OPERATIONS
'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ReservationFeedResponse } from '@/lib/control-center/types';

export function ReservationLiveSync({ locationId }: { locationId: string }) {
  const router = useRouter();
  const cursor = useRef<ReservationFeedResponse['cursor']>({
    after: new Date().toISOString(),
    afterId: null,
  });
  const [connected, setConnected] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  useEffect(() => {
    let stopped = false;

    async function poll() {
      const query = new URLSearchParams({
        locationId,
        after: cursor.current.after,
        limit: '50',
      });

      if (cursor.current.afterId) {
        query.set('afterId', cursor.current.afterId);
      }

      try {
        const response = await fetch(
          `/api/control-center/reservation-feed?${query}`,
          { cache: 'no-store' },
        );

        if (!response.ok) {
          setConnected(false);
          return;
        }

        const payload = (await response.json()) as ReservationFeedResponse;

        cursor.current = payload.cursor;
        setConnected(true);

        if (payload.items.length > 0) {
          setLastUpdate(new Date());
          router.refresh();
        }
      } catch {
        setConnected(false);
      }
    }

    const interval = window.setInterval(() => {
      if (!stopped) {
        void poll();
      }
    }, 3000);

    void poll();

    return () => {
      stopped = true;
      window.clearInterval(interval);
    };
  }, [locationId, router]);

  return (
    <div className={connected ? 'live-pill' : 'live-pill disconnected'}>
      <span />
      <strong>{connected ? 'Live' : 'Riconnessione…'}</strong>
      {lastUpdate ? (
        <small>
          {lastUpdate.toLocaleTimeString('it-IT', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          })}
        </small>
      ) : null}
    </div>
  );
}
