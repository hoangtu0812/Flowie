import { FeatureUnavailable } from '@/components/common/feature-unavailable';
import MainLayout from '@/components/layout/main-layout';

export default function AgentPage() {
   return (
      <MainLayout>
         <FeatureUnavailable
            title="AI Agent unavailable"
            description="Flowie does not have an AI service configured, so this route cannot show a simulated chat."
         />
      </MainLayout>
   );
}
