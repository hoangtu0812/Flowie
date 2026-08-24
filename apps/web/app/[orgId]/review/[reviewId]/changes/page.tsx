import { FeatureUnavailable } from '@/components/common/feature-unavailable';
import MainLayout from '@/components/layout/main-layout';

export default function ReviewDiffPage() {
   return (
      <MainLayout>
         <FeatureUnavailable
            title="Code reviews unavailable"
            description="This deployment does not connect repositories or provide code-review workflows."
         />
      </MainLayout>
   );
}
