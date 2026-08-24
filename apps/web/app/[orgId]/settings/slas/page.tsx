import SlasSettings from '@/components/common/settings/slas-settings';
import MainLayout from '@/components/layout/main-layout';
import Header from '@/components/layout/headers/settings/header';

export default function SlasSettingsPage() {
   return (
      <MainLayout header={<Header />} headersNumber={1}>
         <SlasSettings />
      </MainLayout>
   );
}
