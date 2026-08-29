import { authenticatedFetch } from '@/lib/workspaces';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export type ScmProvider = 'GITHUB' | 'AZURE_DEVOPS';
export type ReviewState = 'OPEN' | 'MERGED' | 'CLOSED' | 'ABANDONED';

export type ReviewCapabilities = {
   canComment: boolean;
   canInlineComment: boolean;
   canChangeDecision: boolean;
   canMerge: boolean;
   supportsIterations: boolean;
   decisions: string[];
};

export type ReviewReviewer = {
   externalUserId: string;
   displayName: string | null;
   reviewerKind: 'USER' | 'TEAM';
   isRequired: boolean;
   decision: string;
   providerDecision: string | null;
   flowieUserId: string | null;
   isCurrentUser: boolean;
};

export type ReviewIssueLink = {
   issueId: string;
   identifier: string;
   title: string;
   source: string;
   createdAt: string;
};

export type CodeReview = {
   id: string;
   workspaceId: string;
   provider: ScmProvider;
   connectionId: string;
   connectionName: string;
   repositoryId: string;
   repositoryName: string;
   externalReviewId: string;
   number: number | null;
   title: string;
   description: string | null;
   state: ReviewState;
   isDraft: boolean;
   externalAuthorId: string;
   authorName: string | null;
   sourceRef: string;
   targetRef: string;
   headRevision: string;
   latestRevisionKey: string;
   remoteUrl: string;
   additions: number | null;
   deletions: number | null;
   changedFiles: number | null;
   externalCreatedAt: string;
   externalUpdatedAt: string;
   mergedAt: string | null;
   closedAt: string | null;
   assignedToMe: boolean;
   createdByMe: boolean;
   unread: boolean;
   needsAttention: boolean;
   capabilities: ReviewCapabilities;
   reviewers: ReviewReviewer[];
   issueLinks: ReviewIssueLink[];
   revisions?: Array<{
      externalRevisionId: string;
      sequence: number | null;
      baseRevision: string | null;
      headRevision: string;
      externalCreatedAt: string | null;
   }>;
};

export type ScmConnection = {
   id: string;
   workspaceId: string;
   provider: ScmProvider;
   externalAccountId: string;
   displayName: string;
   status: 'ACTIVE' | 'SUSPENDED' | 'REVOKED' | 'ERROR';
   authMode: 'INSTALLATION' | 'SERVICE_PRINCIPAL' | 'MANAGED_IDENTITY';
   settings: Record<string, string>;
   credentialConfigured: boolean;
   capabilities: ReviewCapabilities;
   repositoryCount: number;
   enabledRepositoryCount: number;
   lastSyncedAt: string | null;
   lastError: string | null;
   createdAt: string;
   updatedAt: string;
   webhookPath?: string;
   webhookUsername?: string;
   webhookSecret?: string;
};

export type ScmRepository = {
   id: string;
   connectionId: string;
   provider: ScmProvider;
   connectionName: string;
   externalProjectId: string | null;
   externalRepositoryId: string;
   name: string;
   fullName: string;
   isPrivate: boolean;
   defaultBranch: string | null;
   enabled: boolean;
   teamId: string | null;
   teamName: string | null;
};

export type ScmIdentity = {
   id: string;
   connectionId: string;
   userId: string;
   flowieName: string;
   flowieEmail: string;
   externalUserId: string;
   displayName: string | null;
   email: string | null;
   updatedAt: string;
};

async function apiError(response: Response, fallback: string): Promise<Error> {
   const payload = (await response.json().catch(() => null)) as { message?: string } | null;
   return new Error(payload?.message ?? fallback);
}

export async function loadReviews(
   workspaceId: string,
   options: {
      view: 'assigned' | 'created' | 'all';
      state?: ReviewState;
      provider?: ScmProvider;
      search?: string;
   }
): Promise<CodeReview[]> {
   const query = new URLSearchParams({ workspaceId, view: options.view });
   if (options.state) query.set('state', options.state);
   if (options.provider) query.set('provider', options.provider);
   if (options.search?.trim()) query.set('search', options.search.trim());
   const response = await authenticatedFetch(`${api}/reviews?${query}`);
   if (!response.ok) throw await apiError(response, 'Could not load reviews.');
   return ((await response.json()) as { data: CodeReview[] }).data;
}

export async function loadReview(workspaceId: string, reviewId: string): Promise<CodeReview> {
   const query = new URLSearchParams({ workspaceId });
   const response = await authenticatedFetch(`${api}/reviews/${reviewId}?${query}`);
   if (!response.ok) throw await apiError(response, 'Could not load this review.');
   return ((await response.json()) as { data: CodeReview }).data;
}

export async function markReviewViewed(workspaceId: string, reviewId: string): Promise<void> {
   const query = new URLSearchParams({ workspaceId });
   const response = await authenticatedFetch(`${api}/reviews/${reviewId}/viewed?${query}`, {
      method: 'POST',
   });
   if (!response.ok) throw await apiError(response, 'Could not update review state.');
}

export async function linkReviewIssue(
   workspaceId: string,
   reviewId: string,
   issueIdentifier: string
): Promise<ReviewIssueLink> {
   const query = new URLSearchParams({ workspaceId });
   const response = await authenticatedFetch(`${api}/reviews/${reviewId}/issues?${query}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ issueIdentifier: issueIdentifier.trim().toUpperCase() }),
   });
   if (!response.ok) throw await apiError(response, 'Could not link the Issue.');
   return ((await response.json()) as { data: ReviewIssueLink }).data;
}

export async function unlinkReviewIssue(
   workspaceId: string,
   reviewId: string,
   issueId: string
): Promise<void> {
   const query = new URLSearchParams({ workspaceId });
   const response = await authenticatedFetch(
      `${api}/reviews/${reviewId}/issues/${issueId}?${query}`,
      { method: 'DELETE' }
   );
   if (!response.ok) throw await apiError(response, 'Could not unlink the Issue.');
}

export async function loadScmConnections(workspaceId: string): Promise<ScmConnection[]> {
   const query = new URLSearchParams({ workspaceId });
   const response = await authenticatedFetch(`${api}/scm/connections?${query}`);
   if (!response.ok) throw await apiError(response, 'Could not load source-control connections.');
   return ((await response.json()) as { data: ScmConnection[] }).data;
}

export async function createScmConnection(input: {
   workspaceId: string;
   provider: ScmProvider;
   externalAccountId: string;
   displayName: string;
   authMode: 'INSTALLATION' | 'SERVICE_PRINCIPAL' | 'MANAGED_IDENTITY';
   settings: Record<string, string>;
   clientSecret?: string;
}): Promise<ScmConnection> {
   const response = await authenticatedFetch(`${api}/scm/connections`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
   });
   if (!response.ok) throw await apiError(response, 'Could not create the connection.');
   return ((await response.json()) as { data: ScmConnection }).data;
}

export async function syncScmConnection(
   workspaceId: string,
   connectionId: string
): Promise<{ repositories: number; reviews: number }> {
   const query = new URLSearchParams({ workspaceId });
   const response = await authenticatedFetch(
      `${api}/scm/connections/${connectionId}/sync?${query}`,
      {
         method: 'POST',
      }
   );
   if (!response.ok) throw await apiError(response, 'Could not synchronize the connection.');
   return ((await response.json()) as { data: { repositories: number; reviews: number } }).data;
}

export async function setScmConnectionActive(
   workspaceId: string,
   connectionId: string,
   active: boolean
): Promise<void> {
   const query = new URLSearchParams({ workspaceId });
   const response = await authenticatedFetch(
      active
         ? `${api}/scm/connections/${connectionId}/reactivate?${query}`
         : `${api}/scm/connections/${connectionId}?${query}`,
      { method: active ? 'POST' : 'DELETE' }
   );
   if (!response.ok) throw await apiError(response, 'Could not update the connection.');
}

export async function loadScmRepositories(
   workspaceId: string,
   connectionId?: string
): Promise<ScmRepository[]> {
   const query = new URLSearchParams({ workspaceId });
   if (connectionId) query.set('connectionId', connectionId);
   const response = await authenticatedFetch(`${api}/scm/repositories?${query}`);
   if (!response.ok) throw await apiError(response, 'Could not load repositories.');
   return ((await response.json()) as { data: ScmRepository[] }).data;
}

export async function updateScmRepository(
   workspaceId: string,
   repositoryId: string,
   input: { enabled: boolean; teamId: string | null }
): Promise<void> {
   const query = new URLSearchParams({ workspaceId });
   const response = await authenticatedFetch(`${api}/scm/repositories/${repositoryId}?${query}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
   });
   if (!response.ok) throw await apiError(response, 'Could not update the repository.');
}

export async function loadScmIdentities(
   workspaceId: string,
   connectionId: string
): Promise<ScmIdentity[]> {
   const query = new URLSearchParams({ workspaceId, connectionId });
   const response = await authenticatedFetch(`${api}/scm/identities?${query}`);
   if (!response.ok) throw await apiError(response, 'Could not load identity mappings.');
   return ((await response.json()) as { data: ScmIdentity[] }).data;
}

export async function saveScmIdentity(
   workspaceId: string,
   connectionId: string,
   userId: string,
   externalUserId: string
): Promise<void> {
   const query = new URLSearchParams({ workspaceId });
   const response = await authenticatedFetch(
      `${api}/scm/connections/${connectionId}/identities/${userId}?${query}`,
      {
         method: 'PUT',
         headers: { 'content-type': 'application/json' },
         body: JSON.stringify({ externalUserId: externalUserId.trim() }),
      }
   );
   if (!response.ok) throw await apiError(response, 'Could not save the identity mapping.');
}

export async function deleteScmIdentity(
   workspaceId: string,
   connectionId: string,
   userId: string
): Promise<void> {
   const query = new URLSearchParams({ workspaceId });
   const response = await authenticatedFetch(
      `${api}/scm/connections/${connectionId}/identities/${userId}?${query}`,
      { method: 'DELETE' }
   );
   if (!response.ok) throw await apiError(response, 'Could not delete the identity mapping.');
}

export function absoluteWebhookUrl(path: string): string {
   try {
      return new URL(path, api).toString();
   } catch {
      return path;
   }
}
