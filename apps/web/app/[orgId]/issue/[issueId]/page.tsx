import { RealIssueDetail } from '@/components/issues/real-issue-detail';
import MainLayout from '@/components/layout/main-layout';

export default async function IssuePage({ params }: { params: Promise<{ issueId: string }> }) {
   const { issueId } = await params;
   return (
      <MainLayout header={<div className="w-full border-b px-6 py-3 font-medium">Issue</div>}>
         <RealIssueDetail issueId={issueId} />
      </MainLayout>
   );
}
