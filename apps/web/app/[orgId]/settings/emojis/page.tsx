import EmojisSettings from '@/components/common/settings/emojis-settings';
import MainLayout from '@/components/layout/main-layout';
import Header from '@/components/layout/headers/settings/header';

export default function EmojisSettingsPage() {
   return (
      <MainLayout header={<Header />} headersNumber={1}>
         <EmojisSettings />
      </MainLayout>
   );
}
