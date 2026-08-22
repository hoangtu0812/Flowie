import { RealProjectDetail } from '@/components/projects/real-project-detail';
import MainLayout from '@/components/layout/main-layout';

interface ProjectPageProps {
   params: Promise<{ projectId: string; orgId: string }>;
}

export default async function ProjectPage({ params }: ProjectPageProps) {
   const { projectId, orgId } = await params;

   return (
      <MainLayout header={<div className="w-full border-b px-6 py-3 font-medium">Project</div>}>
         <RealProjectDetail orgId={orgId} projectId={projectId} view="activity" />
      </MainLayout>
   );
}
