import ProjectTemplatesSettings from '@/components/common/settings/project-templates-settings';
import MainLayout from '@/components/layout/main-layout';
import Header from '@/components/layout/headers/settings/header';

export default function ProjectTemplatesSettingsPage() {
   return (
      <MainLayout header={<Header />} headersNumber={1}>
         <ProjectTemplatesSettings />
      </MainLayout>
   );
}
