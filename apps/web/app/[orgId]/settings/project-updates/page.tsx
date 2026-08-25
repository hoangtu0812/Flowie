import ProjectUpdatesSettings from '@/components/common/settings/project-updates-settings';
import MainLayout from '@/components/layout/main-layout';
import Header from '@/components/layout/headers/settings/header';

export default function ProjectUpdatesSettingsPage() {
   return (
      <MainLayout header={<Header />} headersNumber={1}>
         <ProjectUpdatesSettings />
      </MainLayout>
   );
}
