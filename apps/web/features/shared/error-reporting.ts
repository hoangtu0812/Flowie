'use client';
import { useEffect, useState } from 'react';
import { authenticatedFetch, loadCurrentWorkspace } from '@/lib/workspaces';
import { responseData } from '@/lib/http';
import { appPathname } from '@/lib/base-path';

const lastReport = new Map<string, number>();
const kinds = ['issue', 'project', 'initiative', 'view', 'settings', 'inbox'];
export async function reportClientFailure(
   category: 'render' | 'unhandled' | 'network',
   digest?: string
) {
   const segment = appPathname().split('/')[2];
   const routeKind = kinds.includes(segment) ? segment : 'other';
   const safeDigest = digest && /^[A-Za-z0-9_-]{1,64}$/.test(digest) ? digest : undefined;
   const key = `${category}/${routeKind}`;
   if (Date.now() - (lastReport.get(key) ?? 0) < 60000) return;
   lastReport.set(key, Date.now());
   try {
      const workspace = await loadCurrentWorkspace();
      const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
      return (
         await responseData<{ reference: string }>(
            await authenticatedFetch(`${api}/operations/client-errors`, {
               method: 'POST',
               headers: { 'content-type': 'application/json' },
               body: JSON.stringify({
                  workspaceId: workspace.id,
                  category,
                  routeKind,
                  digest: safeDigest,
               }),
            })
         )
      ).reference;
   } catch {
      return;
   }
}

export function useErrorReference(digest?: string) {
   const [reference, setReference] = useState(digest);
   useEffect(() => {
      let active = true;
      void reportClientFailure('render', digest).then((value) => {
         if (active && value) setReference(value);
      });
      return () => {
         active = false;
      };
   }, [digest]);
   return reference;
}

export function ClientErrorObserver() {
   useEffect(() => {
      const report = () => {
         void reportClientFailure('unhandled');
      };
      window.addEventListener('unhandledrejection', report);
      window.addEventListener('error', report);
      return () => {
         window.removeEventListener('unhandledrejection', report);
         window.removeEventListener('error', report);
      };
   }, []);
   return null;
}
