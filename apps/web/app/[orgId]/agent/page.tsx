import { FeatureUnavailable } from '@/components/common/feature-unavailable';
import MainLayout from '@/components/layout/main-layout';

export default function AgentPage() {
   return (
      <MainLayout>
         <FeatureUnavailable />
      </MainLayout>
   );
}
