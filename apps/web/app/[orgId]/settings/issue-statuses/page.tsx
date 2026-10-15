import WorkflowSettings from '@/features/issues/workflow-settings';
import MainLayout from '@/components/layout/main-layout';
import Header from '@/components/layout/headers/settings/header';
export default function IssueStatusesPage() {
   return (
      <MainLayout header={<Header />} headersNumber={1}>
         <WorkflowSettings />
      </MainLayout>
   );
}
