import { ProjectDocs } from '@/features/documents/project-docs';
import { LiveProjectProvider } from '@/components/common/projects/details/use-live-project';
import Header from '@/components/layout/headers/project/header';
import MainLayout from '@/components/layout/main-layout';

interface ProjectDocsPageProps {
   params: Promise<{ projectId: string }>;
}

export default async function ProjectDocsPage({ params }: ProjectDocsPageProps) {
   const { projectId } = await params;

   return (
      <LiveProjectProvider projectId={projectId}>
         <MainLayout header={<Header projectId={projectId} />}>
            <ProjectDocs projectId={projectId} />
         </MainLayout>
      </LiveProjectProvider>
   );
}
