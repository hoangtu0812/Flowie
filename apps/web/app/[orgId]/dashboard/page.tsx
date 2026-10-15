import { WorkspaceDashboard } from '@/features/reporting/workspace-dashboard';
import MainLayout from '@/components/layout/main-layout';

export default function DashboardPage() {
   return (
      <MainLayout>
         <WorkspaceDashboard />
      </MainLayout>
   );
}
