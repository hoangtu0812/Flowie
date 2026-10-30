import { ProjectRoute } from '@/components/common/projects/project-route';

interface ProjectPageProps {
   params: Promise<{ projectId: string }>;
}

export default async function ProjectPage({ params }: ProjectPageProps) {
   const { projectId } = await params;

   return <ProjectRoute projectKey={decodeURIComponent(projectId)} view="activity" />;
}
