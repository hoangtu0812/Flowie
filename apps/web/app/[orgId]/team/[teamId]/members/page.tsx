import { RealTeamDetail } from '@/components/teams/real-team-detail';
import MainLayout from '@/components/layout/main-layout';

export default async function TeamMembersPage({ params }: { params: Promise<{ teamId: string }> }) {
   const { teamId } = await params;
   return (
      <MainLayout
         header={<div className="w-full border-b px-6 py-3 font-medium">Team members</div>}
      >
         <RealTeamDetail teamId={teamId} view="members" />
      </MainLayout>
   );
}
