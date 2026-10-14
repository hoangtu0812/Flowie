'use client';
import { useEffect, useState } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { DesignSurface } from '@/components/common/design-surface';
import { authenticatedFetch, loadCurrentWorkspace } from '@/lib/workspaces';
import { responseData } from '@/lib/http';
import { useIssuesStore } from '@/store/issues-store';
type Report = { total: number; groups: { severity: string; category: string; count: number }[] };
export function BugReport({ teamReference }: { teamReference?: string }) {
   const [open, setOpen] = useState(false);
   const [report, setReport] = useState<Report>();
   const [error, setError] = useState<string>();
   const [refresh, setRefresh] = useState(0);
   const teams = useIssuesStore((state) => state.teams);
   const team = teams.find(
      (item) => item.id === teamReference || item.identifier === teamReference
   );
   useEffect(() => {
      if (!open || (teamReference && !team)) return;
      let active = true;
      setReport(undefined);
      setError(undefined);
      void (async () => {
         try {
            const workspace = await loadCurrentWorkspace();
            const query = new URLSearchParams({ workspaceId: workspace.id });
            if (team) query.set('teamId', team.id);
            const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
            const result = await responseData<Report>(
               await authenticatedFetch(`${api}/issues/bug-report?${query}`)
            );
            if (active) setReport(result);
         } catch (reason) {
            if (active)
               setError(reason instanceof Error ? reason.message : 'Could not load bug report.');
         }
      })();
      return () => {
         active = false;
      };
   }, [open, team?.id, teamReference, refresh]);
   return (
      <DesignSurface>
         <VStack gap={3} padding={3} className="max-h-96" isScrollable>
            <Button
               label={open ? 'Hide bug report' : 'Bug report'}
               onClick={() => setOpen(!open)}
            />
            {open && (
               <>
                  <Heading level={2}>Bugs by severity and workflow status</Heading>
                  {error ? (
                     <Text role="alert">{error}</Text>
                  ) : !report ? (
                     <Text role="status">Loading report…</Text>
                  ) : (
                     <>
                        <Text>
                           {report.total} bugs in accessible {team ? 'team' : 'workspace'} issues.
                        </Text>
                        {report.groups.map((group) => (
                           <HStack
                              key={`${group.severity}/${group.category}`}
                              justify="between"
                              gap={3}
                           >
                              <Text>
                                 {group.severity} · {group.category}
                              </Text>
                              <Text>{group.count}</Text>
                           </HStack>
                        ))}
                     </>
                  )}
                  <Button
                     label="Refresh bug report"
                     onClick={() => setRefresh((value) => value + 1)}
                  />
               </>
            )}
         </VStack>
      </DesignSurface>
   );
}
