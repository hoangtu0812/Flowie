import MainLayout from '@/components/layout/main-layout';
import Header from '@/components/layout/headers/settings/header';
import RecurringPage from '@/features/recurring/recurring-page';
export default function Page() {
   return (
      <MainLayout header={<Header />} headersNumber={1}>
         <RecurringPage />
      </MainLayout>
   );
}
