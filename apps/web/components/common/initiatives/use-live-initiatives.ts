'use client';
import { portfolioFetch } from '@/features/projects/portfolio-fetch';

import { useCallback, useEffect, useRef, useState } from 'react';
import { authenticatedFetch, loadCurrentWorkspace } from '@/lib/workspaces';
import { useParams } from 'next/navigation';
import { responseData, responseEnvelope } from '@/lib/http';
import type { PageMetadata } from '@/features/issues/issue-query';

export type LiveInitiativeProject = {
   id: string;
   name: string;
   identifier: string;
   status: string;
   priority: string;
   health: string;
   targetDate: string | null;
   startDate: string | null;
   createdAt: string;
   team: { id: string; name: string; identifier: string; icon: string | null } | null;
   lead: { id: string; name: string; avatarUrl: string | null } | null;
   issues?: Array<{ id: string; status: { category: string } }>;
   issueSummary?: { total: number; completed?: number; started?: number };
};

export type LiveInitiative = {
   id: string;
   name: string;
   description: string | null;
   status: string;
   priority: string;
   health: string;
   icon: string | null;
   targetDate: string | null;
   createdAt: string;
   updatedAt: string;
   owner: { id: string; name: string; avatarUrl: string | null } | null;
   updates: Array<{
      id: string;
      body: string;
      health: string;
      createdAt: string;
      author: { id: string; name: string; avatarUrl: string | null };
   }>;
   resources: Array<{
      id: string;
      label: string;
      url: string;
      createdAt: string;
      createdBy: { id: string; name: string; avatarUrl: string | null };
   }>;
   labelLinks: Array<{ label: LiveWorkspaceLabel }>;
   projectLinks: Array<{ project: LiveInitiativeProject }>;
   _count: { projectLinks: number };
};

export type LiveWorkspaceProject = LiveInitiativeProject;
export type LiveWorkspaceMember = {
   userId: string;
   status: string;
   user: { id: string; name: string; avatarUrl: string | null };
};
export type LiveWorkspaceLabel = {
   id: string;
   name: string;
   color: string;
};
const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export function useLiveInitiatives() {
   const { orgId, initiativeId } = useParams<{ orgId: string; initiativeId?: string }>();
   const [workspaceId, setWorkspaceId] = useState<string>();
   const [initiatives, setInitiatives] = useState<LiveInitiative[]>([]);
   const [projects, setProjects] = useState<LiveWorkspaceProject[]>([]);
   const [members, setMembers] = useState<LiveWorkspaceMember[]>([]);
   const [labels, setLabels] = useState<LiveWorkspaceLabel[]>([]);
   const [loading, setLoading] = useState(true);
   const [error, setError] = useState<string>();
   const [refreshKey, setRefreshKey] = useState(0);
   const [page, setPage] = useState<PageMetadata>();
   const [loadingMore, setLoadingMore] = useState(false);
   const [pageError, setPageError] = useState<string>();
   const generation = useRef(0);
   const reload = useCallback(() => setRefreshKey((value) => value + 1), []);
   useEffect(() => {
      let current = true;
      const scopeGeneration = ++generation.current;
      setPage(undefined);
      setPageError(undefined);
      setLoadingMore(false);
      setWorkspaceId(undefined);
      setInitiatives([]);
      setProjects([]);
      setMembers([]);
      setLabels([]);
      void (async () => {
         setLoading(true);
         setError(undefined);
         try {
            const currentWorkspaceId = (await loadCurrentWorkspace(orgId)).id;
            const [initiativeResponse, projectResponse, membersResponse, labelsResponse] =
               await Promise.all([
                  authenticatedFetch(
                     `${api}/initiatives?workspaceId=${currentWorkspaceId}&limit=100`
                  ),
                  portfolioFetch(`${api}/projects?workspaceId=${currentWorkspaceId}`),
                  authenticatedFetch(`${api}/workspaces/${currentWorkspaceId}/members`),
                  authenticatedFetch(`${api}/labels?workspaceId=${currentWorkspaceId}`),
               ]);
            if (
               !initiativeResponse.ok ||
               !projectResponse.ok ||
               !membersResponse.ok ||
               !labelsResponse.ok
            )
               throw new Error('Could not load initiatives.');
            const firstPage = await responseEnvelope<LiveInitiative[], PageMetadata>(
               initiativeResponse
            );
            let data = firstPage.data;
            if (initiativeId) {
               const detail = await responseData<LiveInitiative>(
                  await authenticatedFetch(
                     `${api}/initiatives/${initiativeId}?workspaceId=${currentWorkspaceId}`
                  )
               );
               data = [detail, ...data.filter((row) => row.id !== detail.id)];
            }
            const projectData = ((await projectResponse.json()) as { data: LiveWorkspaceProject[] })
               .data;
            const memberData = ((await membersResponse.json()) as { data: LiveWorkspaceMember[] })
               .data;
            const labelData = ((await labelsResponse.json()) as { data: LiveWorkspaceLabel[] })
               .data;
            if (current) {
               setWorkspaceId(currentWorkspaceId);
               setPage(firstPage.meta);
               setInitiatives(data);
               setProjects(projectData);
               setMembers(memberData.filter((member) => member.status === 'ACTIVE'));
               setLabels(labelData);
            }
         } catch (caught) {
            if (current)
               setError(caught instanceof Error ? caught.message : 'Could not load initiatives.');
         } finally {
            if (current) setLoading(false);
         }
      })();
      return () => {
         current = false;
         generation.current = scopeGeneration + 1;
      };
   }, [orgId, initiativeId, refreshKey]);
   useEffect(() => {
      const onChanged = () => reload();
      window.addEventListener('flowie:initiatives-changed', onChanged);
      return () => window.removeEventListener('flowie:initiatives-changed', onChanged);
   }, [reload]);
   const loadMore = async () => {
      if (!workspaceId || !page?.nextCursor || loadingMore) return;
      const request = generation.current;
      setLoadingMore(true);
      setPageError(undefined);
      try {
         const query = new URLSearchParams({ workspaceId, limit: '100', cursor: page.nextCursor });
         const next = await responseEnvelope<LiveInitiative[], PageMetadata>(
            await authenticatedFetch(`${api}/initiatives?${query}`)
         );
         if (request !== generation.current) return;
         setInitiatives((previous) => [
            ...new Map([...previous, ...next.data].map((row) => [row.id, row])).values(),
         ]);
         setPage(next.meta);
      } catch (reason) {
         if (request === generation.current)
            setPageError(
               reason instanceof Error ? reason.message : 'Could not load more initiatives.'
            );
      } finally {
         if (request === generation.current) setLoadingMore(false);
      }
   };
   return {
      workspaceId,
      initiatives,
      projects,
      members,
      labels,
      loading,
      error,
      reload,
      page,
      loadingMore,
      pageError,
      loadMore,
   };
}
