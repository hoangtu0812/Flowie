import MainLayout from '@/components/layout/main-layout';
import { FeatureUnavailable } from '@/components/common/feature-unavailable';

export default function Page() {
   return (
      <MainLayout>
         <FeatureUnavailable />
      </MainLayout>
   );
}
