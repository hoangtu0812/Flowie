import ProjectTimeline from '@/components/common/projects/details/project-timeline';
import { LiveProjectProvider } from '@/components/common/projects/details/use-live-project';
import Header from '@/components/layout/headers/project/header';
import MainLayout from '@/components/layout/main-layout';

interface ProjectPageProps {
   params: Promise<{ projectId: string }>;
}

export default async function ProjectTimelinePage({ params }: ProjectPageProps) {
   const { projectId } = await params;

   return (
      <LiveProjectProvider projectId={projectId}>
         <MainLayout header={<Header projectId={projectId} />}>
            <ProjectTimeline projectId={projectId} />
         </MainLayout>
      </LiveProjectProvider>
   );
}
