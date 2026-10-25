'use client';
import { useEffect } from 'react';
import { useUiPreferencesStore } from '@/store/ui-preferences-store';
import { authenticatedFetch } from '@/lib/workspaces';
import { responseData } from '@/lib/http';
import { loadCurrentUser } from './current-user';
import { AutosaveController } from '@/features/documents/autosave-controller';
const keys = [
   'locale',
   'commentSubmitMode',
   'defaultHome',
   'defaultWorkspaceId',
   'fontSize',
   'pointerCursors',
   'underlineLinks',
   'timezone',
   'weekStart',
   'autoAssignSelf',
] as const;
const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
type Values = Pick<ReturnType<typeof useUiPreferencesStore.getState>, (typeof keys)[number]>;
const values = (state: ReturnType<typeof useUiPreferencesStore.getState>) =>
   Object.fromEntries(keys.map((key) => [key, state[key]])) as Values;

export function PreferenceSync() {
   const reload = useUiPreferencesStore((state) => state.syncReload);
   useEffect(() => {
      let active = true,
         unsubscribe: undefined | (() => void),
         controller: AutosaveController<Values> | undefined,
         timer: ReturnType<typeof setTimeout> | undefined;
      const store = useUiPreferencesStore;
      store.setState({ syncStatus: 'loading', syncError: undefined });
      void (async () => {
         try {
            const user = await loadCurrentUser();
            const saved = await responseData<{
               values: Values;
               version: number;
               accountId: string;
            }>(await authenticatedFetch(`${api}/users/me/ui-preferences`));
            if (!active) return;
            if (saved.accountId !== user.id)
               throw new Error('Your account changed. Reload preferences.');
            store.setState({
               ...saved.values,
               defaultWorkspaceId: saved.values.defaultWorkspaceId ?? null,
               accountId: user.id,
               syncStatus: 'saved',
            });
            let version = saved.version;
            controller = new AutosaveController(saved.values, async (draft) => {
               if (!active) return;
               const response = await responseData<{ version: number }>(
                  await authenticatedFetch(`${api}/users/me/ui-preferences`, {
                     method: 'PUT',
                     headers: { 'content-type': 'application/json' },
                     body: JSON.stringify({
                        expectedVersion: version,
                        values: draft,
                        accountId: user.id,
                     }),
                  })
               );
               version = response.version;
            });
            const changes = controller.subscribe(() => {
               if (!active) return;
               const snapshot = controller!.getSnapshot();
               store.setState({
                  syncStatus: snapshot.error
                     ? 'error'
                     : snapshot.saving
                       ? 'saving'
                       : snapshot.dirty
                         ? 'pending'
                         : 'saved',
                  syncError: snapshot.error,
               });
            });
            unsubscribe = store.subscribe((next, previous) => {
               if (JSON.stringify(values(next)) === JSON.stringify(values(previous))) return;
               controller!.update(values(next));
               if (timer) clearTimeout(timer);
               timer = setTimeout(() => void controller!.flush(), 500);
            });
            const cleanup = unsubscribe;
            unsubscribe = () => {
               cleanup();
               changes();
            };
         } catch (reason) {
            if (active)
               store.setState({
                  syncStatus: 'error',
                  syncError:
                     reason instanceof Error
                        ? reason.message
                        : 'Could not synchronize preferences.',
               });
         }
      })();
      return () => {
         active = false;
         unsubscribe?.();
         if (timer) clearTimeout(timer);
      };
   }, [reload]);
   return null;
}
