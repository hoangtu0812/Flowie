import MainLayout from '@/components/layout/main-layout';
import Header from '@/components/layout/headers/projects/header';
import Projects from '@/components/common/projects/projects';
import { ProjectsDataProvider } from '@/features/projects/projects-data';

export default function ProjectsPage() {
   return (
      <ProjectsDataProvider>
         <MainLayout header={<Header />} headersNumber={1}>
            <Projects />
         </MainLayout>
      </ProjectsDataProvider>
   );
}
