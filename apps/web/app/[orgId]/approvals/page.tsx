import MainLayout from '@/components/layout/main-layout';
import { ApprovalsPage } from '@/features/approvals/approvals-page';

export default function Page() {
   return (
      <MainLayout>
         <ApprovalsPage />
      </MainLayout>
   );
}
