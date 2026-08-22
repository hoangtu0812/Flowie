import { RealMyIssues } from '@/components/issues/real-my-issues';
import MainLayout from '@/components/layout/main-layout';

export default function MyIssuesPage() {
   return (
      <MainLayout
         header={<div className="w-full border-b px-6 py-3 font-medium">My issues</div>}
         headersNumber={1}
      >
         <RealMyIssues />
      </MainLayout>
   );
}
