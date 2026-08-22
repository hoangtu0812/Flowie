import { RealIssues } from '@/components/issues/real-issues';
import Header from '@/components/layout/headers/issues/header';
import MainLayout from '@/components/layout/main-layout';

export default async function AllIssuesPage({ params }: { params: Promise<{ teamId: string }> }) {
   const { teamId } = await params;
   return (
      <MainLayout header={<Header />}>
         <RealIssues teamId={teamId} />
      </MainLayout>
   );
}
