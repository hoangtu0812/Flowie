'use client';

import { useEffect, useState } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Selector } from '@astryxdesign/core/Selector';
import { Text } from '@astryxdesign/core/Text';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { LoadingState } from '@/components/common/loading-state';
import { QueryState } from '@/components/common/query-state';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { downloadFile } from '@/features/shared/download-file';
import { usePagedResource } from '@/features/shared/use-paged-resource';
import { useMessages } from '@/features/shared/use-messages';
import { loadJoinedWorkspaceTeams, type WorkspaceTeam } from '@/features/teams/team-types';
import { localDay, mondayOf } from '@/lib/week';
import { exportTimesheet, loadTimesheet, type Timesheet } from '@/lib/worklogs';
import { useUiPreferencesStore } from '@/store/ui-preferences-store';
import { messages } from './messages.vi';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

/**
 * Weekly timesheet: hours per person per day on the issues the viewer can access, filtered by
 * team and project, with row and column totals and CSV/XLSX export of the underlying entries.
 * The server applies the access scope, so the page only chooses the week and filters.
 * shortcut: the project filter lists the first page of projects; add search when a workspace
 * has more projects than one page holds.
 * VI: Timesheet tuần: số giờ theo người theo ngày trên các issue người xem truy cập được, lọc theo
 * VI: team và dự án, có tổng dòng, tổng cột và xuất CSV/XLSX các bản ghi chi tiết. Server áp phạm vi
 * VI: truy cập, nên trang chỉ chọn tuần và bộ lọc.
 * VI: shortcut: bộ lọc dự án chỉ liệt kê trang dự án đầu tiên; thêm tìm kiếm khi workspace có nhiều
 * VI: dự án hơn một trang.
 */
export function TimesheetPage() {
   const tx = useMessages(messages);
   const locale = useUiPreferencesStore((state) => state.locale);
   const [workspaceId, setWorkspaceId] = useState('');
   const [teams, setTeams] = useState<WorkspaceTeam[]>([]);
   const [weekStart, setWeekStart] = useState(() => mondayOf(localDay()));
   const [teamId, setTeamId] = useState('');
   const [projectId, setProjectId] = useState('');
   const [sheet, setSheet] = useState<Timesheet>();
   const [error, setError] = useState('');
   const [reload, setReload] = useState(0);
   const [exporting, setExporting] = useState(false);
   const projects = usePagedResource<{ id: string; name: string }>(
      workspaceId
         ? `${api}/projects?${new URLSearchParams({ workspaceId, ...(teamId ? { teamId } : {}) })}`
         : undefined
   );
   const filter = {
      weekStart,
      teamId: teamId || undefined,
      projectId: projectId || undefined,
   };

   useEffect(() => {
      void loadJoinedWorkspaceTeams()
         .then((joined) => {
            setWorkspaceId(joined.workspaceId);
            setTeams(joined.teams);
         })
         .catch((reason) => setError(String(reason)));
   }, []);

   useEffect(() => {
      if (!workspaceId) return;
      let current = true;
      setError('');
      void loadTimesheet(workspaceId, {
         weekStart,
         teamId: teamId || undefined,
         projectId: projectId || undefined,
      })
         .then((next) => current && setSheet(next))
         .catch(
            (reason) =>
               current && setError(reason instanceof Error ? reason.message : String(reason))
         );
      return () => {
         current = false;
      };
   }, [workspaceId, weekStart, teamId, projectId, reload]);

   const download = async (format: 'csv' | 'xlsx') => {
      setExporting(true);
      try {
         downloadFile(
            await exportTimesheet(workspaceId, filter, format),
            `flowie-timesheet-${weekStart}.${format}`
         );
      } catch (reason) {
         setError(reason instanceof Error ? reason.message : String(reason));
      } finally {
         setExporting(false);
      }
   };

   const dayLabel = (day: string) =>
      new Date(`${day}T00:00:00`).toLocaleDateString(locale, {
         weekday: 'short',
         day: '2-digit',
         month: '2-digit',
      });
   const hours = (value: number) => (value ? String(value) : '');

   return (
      <VStack className="h-full min-h-0 w-full">
         <HStack gap={2} className="h-10 shrink-0 items-center border-b px-4">
            <SidebarTrigger className="inline-flex lg:hidden" />
            <Text type="label">{tx('Timesheet')}</Text>
         </HStack>
         <VStack gap={4} className="min-h-0 flex-1 overflow-y-auto p-4">
            <Text type="supporting">
               {tx('Hours logged on issues you can access. Log time from an issue.')}
            </Text>
            <HStack gap={2} wrap="wrap" className="items-end">
               <Button
                  label={tx('Previous week')}
                  icon={<ChevronLeft className="size-4" />}
                  isIconOnly
                  size="sm"
                  variant="ghost"
                  onClick={() => setWeekStart(mondayOf(weekStart, -1))}
               />
               <Text type="label" className="tabular-nums">
                  {tx('Week of {date}', { date: weekStart })}
               </Text>
               <Button
                  label={tx('Next week')}
                  icon={<ChevronRight className="size-4" />}
                  isIconOnly
                  size="sm"
                  variant="ghost"
                  onClick={() => setWeekStart(mondayOf(weekStart, 1))}
               />
               <Button
                  label={tx('This week')}
                  size="sm"
                  variant="secondary"
                  onClick={() => setWeekStart(mondayOf(localDay()))}
               />
               <Selector
                  width={200}
                  label={tx('Team')}
                  value={teamId}
                  options={[
                     { value: '', label: tx('All teams') },
                     ...teams.map((team) => ({ value: team.id, label: team.name })),
                  ]}
                  onChange={(value) => {
                     setTeamId(value);
                     setProjectId('');
                  }}
               />
               <Selector
                  width={220}
                  label={tx('Project')}
                  value={projectId}
                  options={[
                     { value: '', label: tx('All projects') },
                     ...projects.items.map((project) => ({
                        value: project.id,
                        label: project.name,
                     })),
                  ]}
                  onChange={setProjectId}
               />
               <Button
                  label={tx('Export CSV')}
                  size="sm"
                  variant="secondary"
                  isDisabled={exporting || !workspaceId}
                  onClick={() => void download('csv')}
               />
               <Button
                  label={tx('Export XLSX')}
                  size="sm"
                  variant="secondary"
                  isDisabled={exporting || !workspaceId}
                  onClick={() => void download('xlsx')}
               />
            </HStack>
            {error && <QueryState message={error} onRetry={() => setReload(reload + 1)} />}
            {!sheet && !error && <LoadingState />}
            {sheet && sheet.people.length === 0 && (
               <Text type="supporting">{tx('No hours logged this week.')}</Text>
            )}
            {sheet && sheet.people.length > 0 && (
               <div className="overflow-x-auto rounded-lg border border-border/70">
                  <table className="w-full text-sm">
                     <thead className="bg-muted/40 text-xs text-muted-foreground">
                        <tr>
                           <th className="px-3 py-2 text-left font-medium">{tx('Person')}</th>
                           {sheet.days.map((day) => (
                              <th key={day} className="px-3 py-2 text-right font-medium">
                                 {dayLabel(day)}
                              </th>
                           ))}
                           <th className="px-3 py-2 text-right font-medium">{tx('Total')}</th>
                        </tr>
                     </thead>
                     <tbody className="divide-y divide-border/60">
                        {sheet.people.map((person) => (
                           <tr key={person.user.id}>
                              <td className="px-3 py-1.5">{person.user.name}</td>
                              {person.hours.map((value, index) => (
                                 <td
                                    key={sheet.days[index]}
                                    className="px-3 py-1.5 text-right tabular-nums"
                                 >
                                    {hours(value)}
                                 </td>
                              ))}
                              <td className="px-3 py-1.5 text-right font-medium tabular-nums">
                                 {person.total}
                              </td>
                           </tr>
                        ))}
                     </tbody>
                     <tfoot className="border-t bg-muted/40 font-medium">
                        <tr>
                           <td className="px-3 py-2">{tx('Total')}</td>
                           {sheet.totals.map((value, index) => (
                              <td
                                 key={sheet.days[index]}
                                 className="px-3 py-2 text-right tabular-nums"
                              >
                                 {hours(value)}
                              </td>
                           ))}
                           <td className="px-3 py-2 text-right tabular-nums">{sheet.total}</td>
                        </tr>
                     </tfoot>
                  </table>
               </div>
            )}
         </VStack>
      </VStack>
   );
}
