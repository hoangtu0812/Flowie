import { DisabledFeature } from '@/components/common/disabled-feature';
import MainLayout from '@/components/layout/main-layout';

export default function ReviewDiffPage() {
   return (
      <MainLayout>
         <DisabledFeature title="Reviews" />
      </MainLayout>
   );
}
