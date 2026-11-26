import MainLayout from '@/components/layout/main-layout';
import Header from '@/components/layout/headers/settings/header';
import { ApiKeysSettings } from '@/features/settings/api-keys/api-keys-settings';

export default function Page() {
   return (
      <MainLayout header={<Header />} headersNumber={1}>
         <ApiKeysSettings />
      </MainLayout>
   );
}
