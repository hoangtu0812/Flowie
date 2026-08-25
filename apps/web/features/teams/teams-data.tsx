'use client';

import {
   createWorkspaceTeam,
   joinWorkspaceTeam,
   loadCurrentWorkspaceTeams,
   type WorkspaceTeam,
} from '@/components/common/teams/team-types';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { toast } from 'sonner';

type CreateTeamValues = {
   name: string;
   identifier: string;
   description?: string;
};

type TeamsData = {
   workspaceId?: string;
   workspaceLoading: boolean;
   teams: WorkspaceTeam[];
   createTeam: (values: CreateTeamValues) => Promise<void>;
   joinTeam: (teamId: string) => Promise<void>;
   refreshTeams: () => Promise<void>;
};

const TeamsDataContext = createContext<TeamsData | null>(null);

function useTeamsDataSource(): TeamsData {
   const [workspaceId, setWorkspaceId] = useState<string>();
   const [workspaceLoading, setWorkspaceLoading] = useState(true);
   const [teams, setTeams] = useState<WorkspaceTeam[]>([]);

   const refreshTeams = useCallback(async () => {
      const current = await loadCurrentWorkspaceTeams();
      setWorkspaceId(current.workspaceId);
      setTeams(current.teams);
   }, []);

   useEffect(() => {
      let active = true;
      setWorkspaceLoading(true);
      void refreshTeams()
         .catch((error: unknown) => {
            if (active) {
               setWorkspaceId(undefined);
               setTeams([]);
               toast.error(error instanceof Error ? error.message : 'Could not load teams.');
            }
         })
         .finally(() => {
            if (active) setWorkspaceLoading(false);
         });
      return () => {
         active = false;
      };
   }, [refreshTeams]);

   const createTeam = useCallback(
      async (values: CreateTeamValues) => {
         if (!workspaceId) throw new Error('Workspace is not ready yet.');
         const team = await createWorkspaceTeam({
            workspaceId,
            name: values.name.trim(),
            identifier: values.identifier.trim(),
            ...(values.description?.trim() ? { description: values.description.trim() } : {}),
         });
         setTeams((current) => [...current, team].sort((a, b) => a.name.localeCompare(b.name)));
         window.dispatchEvent(new Event('flowie-teams-changed'));
      },
      [workspaceId]
   );

   const joinTeam = useCallback(
      async (teamId: string) => {
         if (!workspaceId) throw new Error('Workspace is not ready yet.');
         await joinWorkspaceTeam(workspaceId, teamId);
         await refreshTeams();
         window.dispatchEvent(new Event('flowie-teams-changed'));
      },
      [refreshTeams, workspaceId]
   );

   return { workspaceId, workspaceLoading, teams, createTeam, joinTeam, refreshTeams };
}

export function TeamsDataProvider({ children }: { children: ReactNode }) {
   return (
      <TeamsDataContext.Provider value={useTeamsDataSource()}>{children}</TeamsDataContext.Provider>
   );
}

export function useTeamsData(): TeamsData {
   const value = useContext(TeamsDataContext);
   if (!value) throw new Error('useTeamsData must be used inside TeamsDataProvider.');
   return value;
}
