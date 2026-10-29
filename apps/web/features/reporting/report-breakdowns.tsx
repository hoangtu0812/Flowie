'use client';
import { useMessages } from '@/features/shared/use-messages';
import { messages } from '@/features/reporting/messages.vi';

import { Button } from '@astryxdesign/core/Button';
import { VStack, HStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { List, ListItem } from '@astryxdesign/core/List';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import Link from 'next/link';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAccountTime } from '@/features/shared/account-time';
import { parseInstant, relativeTime } from '@/lib/time';
import { Grid } from '@astryxdesign/core/Grid';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { usePagedResource } from '@/features/shared/use-paged-resource';
import { ResourcePagination } from '@/features/shared/resource-pagination';
import {
   reportApi,
   type Workload,
   type ProjectReport,
   type ReportChange,
   type ReportQuery,
} from './types';

export function ReportBreakdowns({
   workspace,
   org,
   body,
}: {
   workspace: string;
   org: string;
   body: string;
}) {
   const tx = useMessages(messages);

   const scope = new URLSearchParams({ workspaceId: workspace }).toString();
   const workload = usePagedResource<Workload>(`${reportApi}/workload?${scope}`, undefined, body);
   const projects = usePagedResource<ProjectReport>(
      `${reportApi}/projects?${scope}`,
      undefined,
      body
   );
   return (
      <Grid columns={{ minWidth: 380, max: 2 }} gap={5} width="100%">
         <VStack gap={3} className="min-w-0">
            <Heading level={2}>{tx('Open workload by planned start week')}</Heading>
            <Collapsible trigger={tx('How workload is calculated')} defaultIsOpen={false}>
               <Text>
                  {tx(
                     "Each task's complete estimate is counted once in its planned start week within the selected range. Unscheduled work has a separate group. This is a planning total, not a per-week allocation or remaining-effort estimate."
                  )}
               </Text>
            </Collapsible>
            <List hasDividers>
               {workload.items.map((row) => (
                  <ListItem
                     key={row.id}
                     label={`${row.assigneeName ?? tx('Unassigned')} · ${row.week ? tx('Week of {week}', { week: row.week }) : tx('Unscheduled')}`}
                     description={
                        <Text>
                           {tx(
                              '{value0} open tasks · {value1} estimated mandays · {value2} missing estimates · {value3} overdue',
                              {
                                 value0: row.count,
                                 value1: row.estimatedEffort,
                                 value2: row.missingEstimates,
                                 value3: row.overdue,
                              }
                           )}
                        </Text>
                     }
                  />
               ))}
            </List>
            {!workload.loading && !workload.error && !workload.items.length && (
               <Text color="secondary">{tx('No workload in this scope.')}</Text>
            )}
            <ResourcePagination
               count={workload.items.length}
               {...workload}
               label={tx('workload groups')}
            />
         </VStack>
         <VStack gap={3} className="min-w-0">
            <Heading level={2}>{tx('Progress and effort by current project')}</Heading>
            <Collapsible trigger={tx('How project totals are calculated')} defaultIsOpen={false}>
               <Text>
                  {tx(
                     'Projects group currently matching tasks. Recorded task effort totals are not attributed to guessed work dates. Completion events cover the selected period, including repeat completions after reopening.'
                  )}
               </Text>
            </Collapsible>
            <List hasDividers>
               {projects.items.map((row) => (
                  <ListItem
                     key={row.id}
                     label={row.name ?? tx('No accessible project')}
                     description={
                        <VStack gap={2}>
                           <Text>
                              {tx(
                                 '{value0} tasks · {value1} open · {value2} created in period · {value3} observed completions · Estimated {value4} / actual {value5} mandays',
                                 {
                                    value0: row.total,
                                    value1: row.open,
                                    value2: row.created,
                                    value3: row.completions,
                                    value4: row.estimatedEffort,
                                    value5: row.actualEffort,
                                 }
                              )}
                           </Text>
                           {row.projectId && (
                              <HStack>
                                 <Button
                                    label={tx('Open project')}
                                    href={`/${org}/project/${row.projectId}/overview`}
                                 />
                              </HStack>
                           )}
                        </VStack>
                     }
                  />
               ))}
            </List>
            {!projects.loading && !projects.error && !projects.items.length && (
               <Text color="secondary">{tx('No projects in this scope.')}</Text>
            )}
            <ResourcePagination
               count={projects.items.length}
               {...projects}
               label={tx('project groups')}
            />
         </VStack>
      </Grid>
   );
}
const KIND_DOT = { CREATED: 'neutral', COMPLETED: 'success', REOPENED: 'warning' } as const;
const KIND_VERB = { CREATED: 'created', COMPLETED: 'completed', REOPENED: 'reopened' } as const;

/**
 * Lists one day's captured issue events newest first: "<actor> <verb> <issue link>" with the
 * issue title truncated below, so the link stays visible on narrow screens, and a relative time
 * whose tooltip is the full instant in the report time zone. The day is the heading, so rows are
 * not grouped again. Events without an actor (system changes or deleted users) are attributed
 * to Flowie, as in the issue activity feed.
 * VI: Liệt kê sự kiện issue của một ngày, mới nhất trước: "<người> <động từ> <liên kết issue>",
 * VI: tiêu đề issue cắt gọn ở dòng dưới để liên kết luôn hiện trên màn hình hẹp, và thời gian tương
 * VI: đối có tooltip là thời điểm đầy đủ theo múi giờ báo cáo. Ngày đã là tiêu đề nên không gom
 * VI: nhóm lại. Sự kiện không có người thực hiện (hệ thống hoặc user đã xóa) ghi là Flowie, giống
 * VI: activity feed của issue.
 */
export function DayChanges({
   workspace,
   org,
   query,
   day,
   onClose,
}: {
   workspace: string;
   org: string;
   query: ReportQuery;
   day: string;
   onClose: () => void;
}) {
   const tx = useMessages(messages),
      { locale } = useAccountTime();

   const body = JSON.stringify({ ...query, fromDate: day, toDate: day });
   const changes = usePagedResource<ReportChange>(
      `${reportApi}/changes?${new URLSearchParams({ workspaceId: workspace })}`,
      undefined,
      body
   );
   const fullTime = new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'medium',
      timeZone: query.timezone,
   });
   // The day is a calendar date, so it is formatted in UTC to avoid shifting it a day.
   // VI: Ngày là ngày lịch nên định dạng theo UTC để không bị lệch sang ngày khác.
   const heading = new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeZone: 'UTC' }).format(
      new Date(`${day}T00:00:00Z`)
   );
   return (
      <VStack gap={2} width="100%">
         <HStack gap={2} wrap="wrap" align="center" justify="between">
            <Heading level={2}>{tx('Activity · {day}', { day: heading })}</Heading>
            <Button label={tx('Close day activity')} size="sm" variant="ghost" onClick={onClose} />
         </HStack>
         <List hasDividers>
            {changes.items.map((row) => {
               const at = parseInstant(row.occurredAt),
                  name = row.actor?.name ?? 'Flowie',
                  kind = row.kind as keyof typeof KIND_VERB;
               return (
                  <ListItem
                     key={row.id}
                     startContent={
                        <Avatar className="size-6">
                           <AvatarImage src={row.actor?.avatarUrl ?? undefined} alt="" />
                           <AvatarFallback>{name[0]}</AvatarFallback>
                        </Avatar>
                     }
                     label={
                        <Text>
                           <Text weight="medium">{name}</Text> {tx(KIND_VERB[kind])}{' '}
                           <Link
                              href={`/${org}/issue/${row.identifier}`}
                              className="whitespace-nowrap font-medium underline-offset-2 hover:underline"
                           >
                              {row.identifier}
                           </Link>
                        </Text>
                     }
                     description={
                        <Text type="supporting" color="secondary" className="block truncate">
                           {row.title}
                        </Text>
                     }
                     endContent={
                        <HStack gap={2} align="center" className="shrink-0">
                           <StatusDot variant={KIND_DOT[kind]} label={tx(KIND_VERB[kind])} />
                           <Text type="supporting" color="secondary">
                              <time dateTime={at.toISOString()} title={fullTime.format(at)}>
                                 {relativeTime(row.occurredAt, Date.now(), locale)}
                              </time>
                           </Text>
                        </HStack>
                     }
                  />
               );
            })}
         </List>
         {!changes.loading && !changes.error && !changes.items.length && (
            <Text color="secondary">{tx('No captured activity on this day.')}</Text>
         )}
         <ResourcePagination count={changes.items.length} {...changes} label={tx('day events')} />
      </VStack>
   );
}
