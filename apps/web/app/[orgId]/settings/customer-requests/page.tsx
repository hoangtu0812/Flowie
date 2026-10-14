import CustomerRequestsSettings from '@/components/common/settings/customer-requests-settings';
import MainLayout from '@/components/layout/main-layout';
import Header from '@/components/layout/headers/settings/header';

export default function CustomerRequestsSettingsPage() {
   return (
      <MainLayout header={<Header />} headersNumber={1}>
         <CustomerRequestsSettings />
      </MainLayout>
   );
}
