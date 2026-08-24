'use client';

import { useCallback, useEffect, useState } from 'react';
import { loadCurrentWorkspace } from '@/lib/workspaces';

export type LiveTeamMember = {
   role: string;
   createdAt: string;
   user: {
      id: string;
      name: string;
      email: string;
      avatarUrl: string | null;
      title: string | null;
   };
};

export type LiveTeam = {
   id: string;
   identifier: string;
   name: string;
   description: string | null;
   icon: string | null;
   color: string | null;
   members: LiveTeamMember[];
   _count: { issues: number; projects: number; cycles: number; documents: number };
};

export type LiveDocument = {
   id: string;
   folderId: string | null;
   title: string;
   content: string;
   icon: string;
   pinned: boolean;
   position: number;
   createdAt: string;
   updatedAt: string;
   createdBy: { id: string; name: string; avatarUrl: string | null };
   updatedBy: { id: string; name: string; avatarUrl: string | null };
};

export type LiveDocumentFolder = {
   id: string;
   name: string;
   icon: string;
   position: number;
   documents: LiveDocument[];
};

export type WorkspacePerson = {
   userId: string;
   status: string;
   user: { id: string; name: string; email: string; avatarUrl: string | null };
};

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

/** Resolves a sidebar identifier or database id, then loads the live team data. */
export function useLiveTeam(teamReference: string) {
   const [workspaceId, setWorkspaceId] = useState<string>();
   const [team, setTeam] = useState<LiveTeam>();
   const [documents, setDocuments] = useState<LiveDocument[]>([]);
   const [documentFolders, setDocumentFolders] = useState<LiveDocumentFolder[]>([]);
   const [workspaceMembers, setWorkspaceMembers] = useState<WorkspacePerson[]>([]);
   const [loading, setLoading] = useState(true);
   const [error, setError] = useState<string>();
   const [refreshKey, setRefreshKey] = useState(0);

   useEffect(() => {
      let current = true;
      void (async () => {
         setLoading(true);
         setError(undefined);
         try {
            const currentWorkspaceId = (await loadCurrentWorkspace()).id;

            const teamsResponse = await fetch(`${api}/teams?workspaceId=${currentWorkspaceId}`, {
               credentials: 'include',
            });
            if (!teamsResponse.ok) throw new Error('Could not load teams.');
            const teamsPayload = (await teamsResponse.json()) as {
               data: Array<{ id: string; identifier: string; joined: boolean }>;
            };
            const matchedTeam = teamsPayload.data.find(
               (candidate) =>
                  candidate.joined &&
                  (candidate.id === teamReference || candidate.identifier === teamReference)
            );
            if (!matchedTeam) throw new Error('Team not found.');

            const query = new URLSearchParams({ workspaceId: currentWorkspaceId });
            const [teamResponse, documentFoldersResponse, membersResponse] = await Promise.all([
               fetch(`${api}/teams/${matchedTeam.id}?${query}`, { credentials: 'include' }),
               fetch(
                  `${api}/documents/folders?${new URLSearchParams({ workspaceId: currentWorkspaceId, teamId: matchedTeam.id })}`,
                  { credentials: 'include' }
               ),
               fetch(`${api}/workspaces/${currentWorkspaceId}/members`, { credentials: 'include' }),
            ]);
            if (!teamResponse.ok || !documentFoldersResponse.ok || !membersResponse.ok)
               throw new Error('Could not load team details.');
            if (!current) return;
            const folders = (
               (await documentFoldersResponse.json()) as { data: LiveDocumentFolder[] }
            ).data;
            setWorkspaceId(currentWorkspaceId);
            setTeam(((await teamResponse.json()) as { data: LiveTeam }).data);
            setDocumentFolders(folders);
            setDocuments(folders.flatMap((folder) => folder.documents));
            setWorkspaceMembers(
               ((await membersResponse.json()) as { data: WorkspacePerson[] }).data
            );
         } catch (caught) {
            if (current)
               setError(caught instanceof Error ? caught.message : 'Could not load team details.');
         } finally {
            if (current) setLoading(false);
         }
      })();
      return () => {
         current = false;
      };
   }, [teamReference, refreshKey]);

   const reload = useCallback(() => setRefreshKey((value) => value + 1), []);

   return {
      workspaceId,
      team,
      documents,
      documentFolders,
      workspaceMembers,
      loading,
      error,
      reload,
   };
}
