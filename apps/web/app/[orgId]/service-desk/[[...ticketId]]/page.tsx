import MainLayout from '@/components/layout/main-layout';
import { ServiceDeskPage } from '@/features/service-desk/service-desk-page';

export default function Page() {
   return (
      <MainLayout>
         <ServiceDeskPage />
      </MainLayout>
   );
}
