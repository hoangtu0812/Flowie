import { FeatureUnavailable } from '@/components/common/feature-unavailable';
import MainLayout from '@/components/layout/main-layout';

export default function ReviewsPage() {
   return (
      <MainLayout>
         <FeatureUnavailable
            title="Code reviews unavailable"
            description="Flowie is configured for general project management and does not provide code-review or pull-request workflows."
         />
      </MainLayout>
   );
}
