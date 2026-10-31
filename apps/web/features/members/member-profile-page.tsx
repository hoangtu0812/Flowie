'use client';

import MainLayout from '@/components/layout/main-layout';
import Header from '@/components/layout/headers/profile/header';
import MemberProfile from '@/components/common/members/member-profile';
import { LoadingState } from '@/components/common/loading-state';
import { QueryState } from '@/components/common/query-state';
import { profileUser, useMemberProfile } from './use-member-profile';
import { usePageEntity } from '@/features/shared/document-title';

export function MemberProfilePage({ memberId }: { memberId: string }) {
   const state = useMemberProfile(memberId);
   usePageEntity(state.member?.name);
   if (state.loading) return <LoadingState label="Loading member profile…" />;
   if (!state.member)
      return (
         <QueryState
            title="Member profile unavailable"
            message={state.error ?? 'Member not found.'}
            onRetry={state.retry}
         />
      );
   const member = profileUser(state.member);
   return (
      <MainLayout header={<Header member={member} />}>
         <MemberProfile member={member} profile={state.member} />
      </MainLayout>
   );
}
