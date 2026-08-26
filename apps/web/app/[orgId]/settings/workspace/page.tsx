import MainLayout from '@/components/layout/main-layout';
import WorkspaceSettings from '@/components/common/settings/workspace-settings';
import Header from '@/components/layout/headers/settings/header';

export default function WorkspaceSettingsPage() {
   return (
      <MainLayout header={<Header />} headersNumber={1}>
         <WorkspaceSettings />
      </MainLayout>
   );
}
