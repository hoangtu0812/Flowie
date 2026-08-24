import ProjectPropertiesSettings from '@/components/common/settings/project-properties-settings';
import MainLayout from '@/components/layout/main-layout';
import Header from '@/components/layout/headers/settings/header';

export default function Page() {
   return (
      <MainLayout header={<Header />} headersNumber={1}>
         <ProjectPropertiesSettings />
      </MainLayout>
   );
}
