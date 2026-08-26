import { DisabledFeature } from '@/components/common/disabled-feature';
import MainLayout from '@/components/layout/main-layout';

export default function AgentPage() {
   return (
      <MainLayout>
         <DisabledFeature title="Agent" />
      </MainLayout>
   );
}
