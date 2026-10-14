import AsksSettings from '@/components/common/settings/asks-settings';
import MainLayout from '@/components/layout/main-layout';
import Header from '@/components/layout/headers/settings/header';

export default function AsksSettingsPage() {
   return (
      <MainLayout header={<Header />} headersNumber={1}>
         <AsksSettings />
      </MainLayout>
   );
}
