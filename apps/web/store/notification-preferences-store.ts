import { loadCurrentWorkspace } from '@/lib/workspaces';
import { create } from 'zustand';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export type NotificationPreferences = {
   teamIssueAdded: boolean;
   issueCompleted: boolean;
   issueAddedToTriage: boolean;
};

const originalPreferences: NotificationPreferences = {
   teamIssueAdded: false,
   issueCompleted: false,
   issueAddedToTriage: false,
};

type NotificationPreferencesState = {
   preferences: NotificationPreferences;
   workspaceId?: string;
   loadPreferences: () => Promise<void>;
   updatePreference: (key: keyof NotificationPreferences, enabled: boolean) => Promise<void>;
};

export const useNotificationPreferencesStore = create<NotificationPreferencesState>((set, get) => ({
   preferences: originalPreferences,

   loadPreferences: async () => {
      const workspace = await loadCurrentWorkspace();
      const response = await fetch(
         `${api}/notifications/preferences?workspaceId=${encodeURIComponent(workspace.id)}`,
         { credentials: 'include' }
      );
      if (!response.ok) throw new Error('Could not load notification preferences.');
      const payload = (await response.json()) as { data: NotificationPreferences };
      set({ workspaceId: workspace.id, preferences: payload.data });
   },

   updatePreference: async (key, enabled) => {
      const previous = get().preferences;
      const preferences = { ...previous, [key]: enabled };
      set({ preferences });
      try {
         const workspaceId = get().workspaceId ?? (await loadCurrentWorkspace()).id;
         const response = await fetch(
            `${api}/notifications/preferences?workspaceId=${encodeURIComponent(workspaceId)}`,
            {
               method: 'PATCH',
               credentials: 'include',
               headers: { 'content-type': 'application/json' },
               body: JSON.stringify(preferences),
            }
         );
         if (!response.ok) throw new Error('Could not save notification preferences.');
         const payload = (await response.json()) as { data: NotificationPreferences };
         set({ workspaceId, preferences: payload.data });
      } catch (error) {
         set({ preferences: previous });
         throw error;
      }
   },
}));
