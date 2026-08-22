import MainLayout from '@/components/layout/main-layout';
import { RealProjects } from '@/components/projects/real-projects';

export default function ProjectsPage() {
   return (
      <MainLayout
         header={<div className="px-6 py-3 font-semibold">Projects</div>}
         headersNumber={1}
      >
         <RealProjects />
      </MainLayout>
   );
}
