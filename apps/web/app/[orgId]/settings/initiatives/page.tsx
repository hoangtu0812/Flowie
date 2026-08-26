import WorkspaceFeatureSettings from '@/components/common/settings/workspace-feature-settings';
import MainLayout from '@/components/layout/main-layout';
import Header from '@/components/layout/headers/settings/header';

export default function InitiativesSettingsPage() {
   return (
      <MainLayout header={<Header />} headersNumber={1}>
         <WorkspaceFeatureSettings feature="initiatives" />
      </MainLayout>
   );
}
