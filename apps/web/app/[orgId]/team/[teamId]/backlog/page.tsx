import { RealIssues } from '@/components/issues/real-issues';
import Header from '@/components/layout/headers/issues/header';
import MainLayout from '@/components/layout/main-layout';

export default async function BacklogIssuesPage({
   params,
}: {
   params: Promise<{ teamId: string }>;
}) {
   const { teamId } = await params;
   return (
      <MainLayout header={<Header />}>
         <RealIssues categories={['TRIAGE', 'BACKLOG']} teamId={teamId} />
      </MainLayout>
   );
}
