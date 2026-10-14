'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useCurrentUserId } from '@/components/common/my-issues/use-my-issues';
import { ApiRequestError } from '@/lib/http';
import { getDocument } from './document-api';
import { AutosaveController, type SaveSnapshot } from './autosave-controller';

export type DocumentDraft = { title: string; content: string };
const EMPTY: SaveSnapshot<DocumentDraft> = {
   draft: { title: '', content: '' },
   dirty: false,
   saving: false,
};
const noSubscribe = () => () => undefined;

export function useDocumentDraft(
   document: { id: string; title: string; content: string; version: number } | undefined,
   open: boolean,
   persist: (
      id: string,
      draft: DocumentDraft & { expectedVersion: number }
   ) => Promise<{ version: number }>
) {
   const accountId = useCurrentUserId();
   const persistRef = useRef(persist);
   persistRef.current = persist;
   const [session, setSession] = useState<{
      documentId: string;
      accountId: string;
      controller: AutosaveController<DocumentDraft>;
      version: { current: number };
   }>();
   const controller =
      open && session?.documentId === document?.id && session?.accountId === accountId
         ? session?.controller
         : undefined;
   const [recovered, setRecovered] = useState(false);
   const [conflict, setConflict] = useState(false);
   const snapshot = useSyncExternalStore(
      controller?.subscribe ?? noSubscribe,
      controller?.getSnapshot ?? (() => EMPTY),
      () => EMPTY
   );

   useEffect(() => {
      if (!open || !document || !accountId) return;
      const id = document.id;
      const initial = { title: document.title, content: document.content ?? '' };
      const version = { current: document.version };
      setConflict(false);
      const next = new AutosaveController(initial, async (draft) => {
         try {
            const result = await persistRef.current(id, {
               ...draft,
               expectedVersion: version.current,
            });
            version.current = result.version;
         } catch (error) {
            if (error instanceof ApiRequestError && error.status === 409) setConflict(true);
            throw error;
         }
      });
      const key = `flowie:document-draft:${accountId}:${id}`;
      setRecovered(false);
      try {
         const cached = localStorage.getItem(key);
         if (cached) {
            const draft: unknown = JSON.parse(cached);
            if (
               draft &&
               typeof draft === 'object' &&
               'title' in draft &&
               typeof draft.title === 'string' &&
               'content' in draft &&
               typeof draft.content === 'string'
            ) {
               if ('version' in draft && typeof draft.version === 'number')
                  version.current = draft.version;
               else setConflict(true);
               next.update({ title: draft.title, content: draft.content });
               setRecovered(next.getSnapshot().dirty);
            }
         }
      } catch {
         /* Storage may be unavailable in private browsing. */
      }
      const unsubscribe = next.subscribe(() => {
         try {
            const state = next.getSnapshot();
            if (state.dirty)
               localStorage.setItem(
                  key,
                  JSON.stringify({ ...state.draft, version: version.current })
               );
            else localStorage.removeItem(key);
         } catch {
            /* Save operations do not depend on browser storage availability. */
         }
      });
      setSession({ documentId: id, accountId, controller: next, version });
      return unsubscribe;
      // Persisted updates must not replace the editor's in-progress draft.
      // eslint-disable-next-line react-hooks/exhaustive-deps
   }, [accountId, document?.id, open]);

   useEffect(() => {
      if (!open || !controller || !snapshot.dirty || snapshot.error || conflict) return;
      const timer = window.setTimeout(() => void controller.flush(), 800);
      return () => window.clearTimeout(timer);
   }, [controller, open, snapshot, conflict]);

   useEffect(() => {
      if (!open || !snapshot.dirty) return;
      const warn = (event: BeforeUnloadEvent) => {
         event.preventDefault();
         event.returnValue = '';
      };
      window.addEventListener('beforeunload', warn);
      return () => window.removeEventListener('beforeunload', warn);
   }, [open, snapshot.dirty]);

   return {
      ...snapshot,
      recovered,
      conflict,
      latest: () =>
         document ? getDocument(document.id) : Promise.reject(new Error('Document not loaded.')),
      resolve: async (
         latest: { title: string; content: string; version: number },
         keepDraft: boolean
      ) => {
         if (!controller || !session) return;
         session.version.current = latest.version;
         controller.rebase({ title: latest.title, content: latest.content }, keepDraft);
         setConflict(false);
         setRecovered(false);
         if (keepDraft) await controller.flush();
      },
      ready: Boolean(controller && accountId),
      keepLocally: () => {
         if (!controller || !session) return false;
         try {
            const value = JSON.stringify({
               ...controller.getSnapshot().draft,
               version: session.version.current,
            });
            const key = `flowie:document-draft:${session.accountId}:${session.documentId}`;
            localStorage.setItem(key, value);
            return localStorage.getItem(key) === value;
         } catch {
            return false;
         }
      },
      update: (draft: DocumentDraft) => controller?.update(draft),
      flush: () =>
         conflict ? Promise.resolve(false) : (controller?.flush() ?? Promise.resolve(false)),
   };
}
