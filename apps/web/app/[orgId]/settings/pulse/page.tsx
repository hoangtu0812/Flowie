import PulseSettings from '@/components/common/settings/pulse-settings';
import MainLayout from '@/components/layout/main-layout';
import Header from '@/components/layout/headers/settings/header';

export default function PulseSettingsPage() {
   return (
      <MainLayout header={<Header />} headersNumber={1}>
         <PulseSettings />
      </MainLayout>
   );
}
