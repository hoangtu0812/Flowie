import MainLayout from '@/components/layout/main-layout';
import Header from '@/components/layout/headers/projects/header';
import { RealProjects } from '@/components/projects/real-projects';

export default function ProjectsPage() {
   return (
      <MainLayout header={<Header />} headersNumber={1}>
         <RealProjects />
      </MainLayout>
   );
}
