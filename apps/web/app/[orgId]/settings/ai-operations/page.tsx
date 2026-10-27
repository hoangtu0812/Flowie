import MainLayout from '@/components/layout/main-layout';
import Header from '@/components/layout/headers/settings/header';
import { OperationsPage } from '@/features/ai/operations-page';

export default function Page() {
   return (
      <MainLayout header={<Header />} headersNumber={1}>
         <OperationsPage />
      </MainLayout>
   );
}
