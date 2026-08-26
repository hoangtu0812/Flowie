import { DisabledFeature } from '@/components/common/disabled-feature';
import MainLayout from '@/components/layout/main-layout';

export default function ReviewOverviewPage() {
   return (
      <MainLayout>
         <DisabledFeature title="Reviews" />
      </MainLayout>
   );
}
