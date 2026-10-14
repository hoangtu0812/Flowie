import ReleasesSettings from '@/components/common/settings/releases-settings';
import MainLayout from '@/components/layout/main-layout';
import Header from '@/components/layout/headers/settings/header';

export default function ReleasesSettingsPage() {
   return (
      <MainLayout header={<Header />} headersNumber={1}>
         <ReleasesSettings />
      </MainLayout>
   );
}
