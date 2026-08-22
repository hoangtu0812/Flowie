import { RealIssues } from '@/components/issues/real-issues';
import MainLayout from '@/components/layout/main-layout';

export default async function BacklogIssuesPage({
   params,
}: {
   params: Promise<{ teamId: string }>;
}) {
   const { teamId } = await params;
   return (
      <MainLayout header={<div className="w-full border-b px-6 py-3 font-medium">Backlog</div>}>
         <RealIssues categories={['TRIAGE', 'BACKLOG']} teamId={teamId} />
      </MainLayout>
   );
}
