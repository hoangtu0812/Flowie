import MainLayout from '@/components/layout/main-layout';
import Header from '@/components/layout/headers/settings/header';
import { RealProfile } from '@/components/settings/real-profile';

export default function Page() {
   return (
      <MainLayout header={<Header />} headersNumber={1}>
         <RealProfile />
      </MainLayout>
   );
}
