'use client';

import { useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { parseAsString, useQueryState } from 'nuqs';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import type { User } from '@/types/users';
import type { MemberProfileData } from '@/features/members/use-member-profile';
import { scopeMemberIssues } from '@/features/members/profile-scope';
import { DesignSurface } from '@/components/common/design-surface';
import { IssueFilterBar } from '@/components/common/issues/issue-filter-bar';
import { applyIssueFilters } from '@/components/common/issues/issue-filter-columns';
import { GroupedIssuesView } from '@/components/common/issues/grouped-issues-view';
import { SearchIssues } from '@/components/common/issues/search-issues';
import { useIssuesStore } from '@/store/issues-store';
import { useFilterStore } from '@/store/filter-store';
import { useSearchStore } from '@/store/search-store';
import { useViewStore } from '@/store/view-store';
import { useRightPanelStore } from '@/store/right-panel-store';
import { InsightsPanel } from '@/components/common/issues/insights-panel';

export default function MemberProfile({
   member,
   profile,
}: {
   member: User;
   profile: MemberProfileData;
}) {
   const { orgId } = useParams<{ orgId: string }>();
   const { issues, statuses, loading, error, loadIssues } = useIssuesStore();
   const { filters } = useFilterStore();
   const [tab] = useQueryState('tab', parseAsString.withDefault('assigned'));
   const { isSearchOpen, searchQuery } = useSearchStore();
   const { viewType } = useViewStore();
   const { openPanel } = useRightPanelStore();
   useEffect(() => {
      void loadIssues();
   }, [loadIssues]);
   const scoped = useMemo(
      () => scopeMemberIssues(issues, member.id, tab),
      [issues, member.id, tab]
   );
   const displayed = useMemo(() => applyIssueFilters(scoped, filters), [scoped, filters]);
   return (
      <VStack height="100%" gap={0}>
         <IssueFilterBar />
         <HStack height="100%" gap={0} align="stretch">
            <VStack width="100%" isScrollable>
               {isSearchOpen && searchQuery.trim() ? (
                  <SearchIssues issues={displayed} />
               ) : (
                  <GroupedIssuesView
                     issues={displayed}
                     totalIssues={scoped}
                     statuses={statuses}
                     isViewTypeGrid={viewType === 'grid'}
                     loading={loading}
                     error={error}
                     onRetry={loadIssues}
                  />
               )}
            </VStack>
            {openPanel === 'insights' && (
               <VStack as="aside" width={380} isScrollable>
                  <InsightsPanel issues={displayed} />
               </VStack>
            )}
            {openPanel !== 'hidden' && openPanel !== 'insights' && (
               <VStack as="aside" width={340} isScrollable className="hidden lg:flex">
                  <DesignSurface>
                     <VStack padding={5} gap={4}>
                        <Heading level={2}>{member.name}</Heading>
                        <Text>{member.status === 'online' ? 'Online now' : 'Offline'}</Text>
                        <Text>{member.email}</Text>
                        <Text>Role: {profile.workspaceRole}</Text>
                        <Text>Timezone: {member.timezone}</Text>
                        <Heading level={3}>Teams</Heading>
                        {profile.teams.map((team) => (
                           <Link key={team.id} href={`/${orgId}/team/${team.identifier}/overview`}>
                              {team.name}
                           </Link>
                        ))}
                        <Heading level={3}>Projects</Heading>
                        {profile.projects.map((project) => (
                           <Link key={project.id} href={`/${orgId}/project/${project.id}/overview`}>
                              {project.name}
                           </Link>
                        ))}
                        {!profile.projects.length && (
                           <Text color="secondary">No linked projects.</Text>
                        )}
                     </VStack>
                  </DesignSurface>
               </VStack>
            )}
         </HStack>
      </VStack>
   );
}
