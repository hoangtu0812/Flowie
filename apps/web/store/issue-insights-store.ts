import { loadCurrentWorkspace } from '@/lib/workspaces';
import { create } from 'zustand';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export type IssueInsightSettings = {
   measure: 'issue-count';
   slice: 'status';
   segment: 'priority';
};

const originalSettings: IssueInsightSettings = {
   measure: 'issue-count',
   slice: 'status',
   segment: 'priority',
};

type IssueInsightsState = {
   settings: IssueInsightSettings;
   workspaceId?: string;
   updatedAt?: string;
   loadDefaults: () => Promise<void>;
   saveDefaults: () => Promise<void>;
};

export const useIssueInsightsStore = create<IssueInsightsState>((set, get) => ({
   settings: originalSettings,

   loadDefaults: async () => {
      const workspace = await loadCurrentWorkspace();
      const response = await fetch(`${api}/workspaces/${workspace.id}/issue-insight-defaults`, {
         credentials: 'include',
      });
      if (!response.ok) throw new Error('Could not load workspace insight defaults.');
      const payload = (await response.json()) as {
         data: { settings: IssueInsightSettings; updatedAt: string };
      };
      set({
         workspaceId: workspace.id,
         settings: payload.data.settings,
         updatedAt: payload.data.updatedAt,
      });
   },

   saveDefaults: async () => {
      const workspaceId = get().workspaceId ?? (await loadCurrentWorkspace()).id;
      const response = await fetch(`${api}/workspaces/${workspaceId}/issue-insight-defaults`, {
         method: 'PATCH',
         credentials: 'include',
         headers: { 'content-type': 'application/json' },
         body: JSON.stringify(get().settings),
      });
      if (!response.ok) throw new Error('Could not save workspace insight defaults.');
      const payload = (await response.json()) as {
         data: { settings: IssueInsightSettings; updatedAt: string };
      };
      set({
         workspaceId,
         settings: payload.data.settings,
         updatedAt: payload.data.updatedAt,
      });
   },
}));
