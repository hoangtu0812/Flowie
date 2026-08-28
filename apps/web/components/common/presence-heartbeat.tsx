'use client';

import { authenticatedFetch } from '@/lib/workspaces';
import { useEffect } from 'react';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
const HEARTBEAT_INTERVAL_MS = 60_000;

export function PresenceHeartbeat() {
   useEffect(() => {
      let disposed = false;
      const publish = async () => {
         if (disposed || document.visibilityState === 'hidden') return;
         const response = await authenticatedFetch(`${api}/auth/presence`, {
            method: 'POST',
         }).catch(() => undefined);
         if (response?.ok && !disposed) {
            window.dispatchEvent(new Event('flowie:presence-refreshed'));
         }
      };
      const onVisibilityChange = () => void publish();

      void publish();
      const interval = window.setInterval(() => void publish(), HEARTBEAT_INTERVAL_MS);
      document.addEventListener('visibilitychange', onVisibilityChange);
      return () => {
         disposed = true;
         window.clearInterval(interval);
         document.removeEventListener('visibilitychange', onVisibilityChange);
      };
   }, []);

   return null;
}
