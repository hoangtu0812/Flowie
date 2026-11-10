'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { parseAsStringLiteral, useQueryState } from 'nuqs';
import { Button } from '@astryxdesign/core/Button';
import { HStack, VStack, Layout, LayoutContent } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { DesignSurface } from '@/components/common/design-surface';
import { RecoveryScreen } from '@/features/shared/recovery-screen';
import { useMessages } from '@/features/shared/use-messages';
import { useViewsDisplayStore, type ViewsOrdering } from '@/store/views-display-store';
import { ViewEditor } from '@/features/views/view-editor';
import { messages } from '@/features/views/messages.vi';
import { useLiveViews } from './use-live-views';

const TABS = ['issues', 'projects'] as const;

export default function Views({ teamId }: { teamId?: string }) {
   const tx = useMessages(messages);
   const { orgId } = useParams<{ orgId: string }>();
   const {
      workspaceId,
      teamId: scopeTeam,
      teamNames,
      views,
      loading,
      error,
      reload,
   } = useLiveViews(teamId);
   const { ordering, displayProperties, setOrdering, toggleProperty } = useViewsDisplayStore();
   const [tab, setTab] = useQueryState('tab', parseAsStringLiteral(TABS).withDefault('issues'));
   const [creating, setCreating] = useState(false);
   const list = useMemo(
      () =>
         [...views]
            .filter((view) => view.entityType === (tab === 'issues' ? 'issue' : 'project'))
            .sort((a, b) =>
               ordering === 'name'
                  ? a.name.localeCompare(b.name)
                  : new Date(ordering === 'created' ? b.createdAt : b.updatedAt).getTime() -
                    new Date(ordering === 'created' ? a.createdAt : a.updatedAt).getTime()
            ),
      [views, tab, ordering]
   );
   if (error)
      return (
         <RecoveryScreen title={tx('Could not load this view')} message={error} retry={reload} />
      );
   return (
      <DesignSurface>
         <Layout
            header={
               <VStack gap={2} padding={3} className="border-b">
                  <HStack gap={2} justify="between" wrap="wrap">
                     <HStack gap={2}>
                        <Button
                           label={tx('Issues')}
                           size="sm"
                           variant={tab === 'issues' ? 'secondary' : 'ghost'}
                           onClick={() => void setTab('issues')}
                        />
                        <Button
                           label={tx('Projects')}
                           size="sm"
                           variant={tab === 'projects' ? 'secondary' : 'ghost'}
                           onClick={() => void setTab('projects')}
                        />
                     </HStack>
                     <Button
                        label={tx('Create view')}
                        size="sm"
                        isDisabled={loading || !workspaceId}
                        onClick={() => setCreating(true)}
                     />
                  </HStack>
                  <HStack gap={3} wrap="wrap">
                     <label>
                        {tx('Ordering')}{' '}
                        <select
                           aria-label={tx('Ordering')}
                           value={ordering}
                           onChange={(event) => setOrdering(event.target.value as ViewsOrdering)}
                        >
                           <option value="name">{tx('Name')}</option>
                           <option value="created">{tx('Created')}</option>
                           <option value="updated">{tx('Updated')}</option>
                        </select>
                     </label>
                     {(['created', 'updated', 'owner'] as const).map((key) => (
                        <Button
                           key={key}
                           size="sm"
                           variant={displayProperties[key] ? 'secondary' : 'ghost'}
                           label={tx(
                              key === 'created'
                                 ? 'Created'
                                 : key === 'updated'
                                   ? 'Updated'
                                   : 'Owner'
                           )}
                           onClick={() => toggleProperty(key)}
                        />
                     ))}
                  </HStack>
               </VStack>
            }
         >
            <LayoutContent padding={0}>
               {loading ? (
                  <Text>{tx('Loading view…')}</Text>
               ) : list.length === 0 ? (
                  <VStack padding={6} gap={2}>
                     <Text>{tx('No views yet')}</Text>
                     <Text type="supporting">
                        {tx('Save filters you use often, then reopen them here.')}
                     </Text>
                  </VStack>
               ) : (
                  list.map((view) => (
                     <Link
                        key={view.id}
                        href={`/${orgId}/view/${view.id}`}
                        className="block border-b hover:bg-accent"
                     >
                        <HStack
                           paddingInline={6}
                           paddingBlock={3}
                           gap={3}
                           justify="between"
                           wrap="wrap"
                        >
                           <VStack gap={1} className="flex-1 min-w-0">
                              <Text weight="medium" maxLines={1}>
                                 {view.name}
                              </Text>
                              <Text type="supporting" maxLines={1}>
                                 {view.description || tx('No description')}
                              </Text>
                              <Text type="supporting">
                                 {tx(view.isShared ? 'Shared' : 'Private')} ·{' '}
                                 {typeof view.filters.teamId === 'string'
                                    ? tx('Team: {team}', {
                                         team: teamNames[view.filters.teamId] ?? tx('Team scope'),
                                      })
                                    : tx('Workspace')}
                              </Text>
                           </VStack>
                           {displayProperties.created && (
                              <Text type="supporting">
                                 {new Date(view.createdAt).toLocaleDateString()}
                              </Text>
                           )}
                           {displayProperties.updated && (
                              <Text type="supporting">
                                 {new Date(view.updatedAt).toLocaleDateString()}
                              </Text>
                           )}
                           {displayProperties.owner && (
                              <Text type="supporting">{view.createdBy.name}</Text>
                           )}
                        </HStack>
                     </Link>
                  ))
               )}
            </LayoutContent>
         </Layout>
         {creating && workspaceId && (
            <ViewEditor
               workspaceId={workspaceId}
               entityType={tab === 'issues' ? 'issue' : 'project'}
               config={
                  tab === 'issues'
                     ? {
                          version: 1,
                          ...(scopeTeam ? { teamId: scopeTeam } : {}),
                          query: { filters: [] },
                       }
                     : scopeTeam
                       ? { teamId: scopeTeam }
                       : {}
               }
               onClose={() => setCreating(false)}
            />
         )}
      </DesignSurface>
   );
}
