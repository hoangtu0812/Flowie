import { authenticatedFetch, loadCurrentWorkspace } from '@/lib/workspaces';
import { responseData } from '@/lib/http';
import { create } from 'zustand';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
export type NotificationPreferences = {
   teamIssueAdded: boolean;
   issueCompleted: boolean;
   issueAddedToTriage: boolean;
};
const defaults: NotificationPreferences = {
   teamIssueAdded: false,
   issueCompleted: false,
   issueAddedToTriage: false,
};
type State = {
   preferences: NotificationPreferences;
   workspaceId?: string;
   loading: boolean;
   saving: boolean;
   error: string | null;
   loadPreferences: () => Promise<void>;
   updatePreference: (key: keyof NotificationPreferences, enabled: boolean) => Promise<void>;
};
let epoch = 0;
export const useNotificationPreferencesStore = create<State>((set, get) => ({
   preferences: defaults,
   loading: false,
   saving: false,
   error: null,
   loadPreferences: async () => {
      const requestEpoch = ++epoch;
      set({
         loading: true,
         saving: false,
         error: null,
         workspaceId: undefined,
         preferences: defaults,
      });
      try {
         const workspace = await loadCurrentWorkspace();
         const preferences = await responseData<NotificationPreferences>(
            await authenticatedFetch(
               `${api}/notifications/preferences?workspaceId=${encodeURIComponent(workspace.id)}`
            )
         );
         if (requestEpoch === epoch)
            set({ workspaceId: workspace.id, preferences, loading: false });
      } catch (error) {
         if (requestEpoch === epoch)
            set({
               loading: false,
               error: error instanceof Error ? error.message : 'Could not load preferences.',
            });
      }
   },
   updatePreference: async (key, enabled) => {
      const { workspaceId, preferences, saving, loading } = get();
      if (!workspaceId || saving || loading) return;
      const requestEpoch = epoch;
      set({ saving: true, error: null, preferences: { ...preferences, [key]: enabled } });
      try {
         const updated = await responseData<NotificationPreferences>(
            await authenticatedFetch(
               `${api}/notifications/preferences?workspaceId=${encodeURIComponent(workspaceId)}`,
               {
                  method: 'PATCH',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({ ...preferences, [key]: enabled }),
               }
            )
         );
         if (requestEpoch === epoch) set({ preferences: updated });
      } catch (error) {
         if (requestEpoch === epoch)
            set({
               preferences,
               error: error instanceof Error ? error.message : 'Could not save preferences.',
            });
      } finally {
         if (requestEpoch === epoch) set({ saving: false });
      }
   },
}));
