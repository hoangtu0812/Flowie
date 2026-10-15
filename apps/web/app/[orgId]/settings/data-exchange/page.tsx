import MainLayout from '@/components/layout/main-layout';
import Header from '@/components/layout/headers/settings/header';
import DataExchangePage from '@/features/data-exchange/data-exchange-page';
export default function Page() {
   return (
      <MainLayout header={<Header />} headersNumber={1}>
         <DataExchangePage />
      </MainLayout>
   );
}
