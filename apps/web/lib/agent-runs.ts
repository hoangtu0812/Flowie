import { authenticatedFetch } from '@/lib/workspaces';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export type AgentAutomation = {
   id: string;
   name: string;
   enabled: boolean;
   dailyLimit: number;
   projectId: string;
};
export type AgentRun = {
   id: string;
   issueId: string;
   issueIdentifier: string;
   issueTitle: string;
   state: string;
   connectionId: string;
   createdAt: string;
};
export type AgentRunSummary = { state: string; count: number; averageSeconds: number | null };

async function request<T>(workspaceId: string, path: string, init?: RequestInit): Promise<T> {
   const response = await authenticatedFetch(
      `${api}/agent-runs/${path}${path.includes('?') ? '&' : '?'}workspaceId=${encodeURIComponent(workspaceId)}`,
      init
   );
   const body = (await response.json()) as { data: T; message?: string };
   if (!response.ok) throw new Error(body.message ?? 'The agent coordination request failed.');
   return body.data;
}

export async function loadAgentRuns(workspaceId: string) {
   return request<{ items: AgentRun[]; nextCursor: string | null }>(workspaceId, 'runs');
}

export async function loadAgentRunSummary(workspaceId: string) {
   return request<AgentRunSummary[]>(workspaceId, 'summary');
}

export async function loadAgentAutomations(workspaceId: string) {
   return request<AgentAutomation[]>(workspaceId, 'automations');
}

export async function cancelAgentRun(workspaceId: string, runId: string) {
   return request(workspaceId, `runs/${encodeURIComponent(runId)}/cancel`, { method: 'POST' });
}

export async function disableAgentAutomation(workspaceId: string, automationId: string) {
   return request(workspaceId, `automations/${encodeURIComponent(automationId)}`, {
      method: 'DELETE',
   });
}

export async function configureProjectRepository(
   workspaceId: string,
   draft: {
      projectId: string;
      name: string;
      repositoryUrl: string;
      baseBranch: string;
      testCommands: string[][];
   }
) {
   return request(workspaceId, 'repositories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
   });
}

export async function configureAgentAutomation(
   workspaceId: string,
   draft: {
      name: string;
      connectionId: string;
      projectId: string;
      labelId: string;
      dailyLimit: number;
      enabled: boolean;
   }
) {
   return request(workspaceId, 'automations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
   });
}
