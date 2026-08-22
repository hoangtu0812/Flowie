import { RealProjects } from '@/components/projects/real-projects';
import MainLayout from '@/components/layout/main-layout';

export default async function TeamProjectsPage({
   params,
}: {
   params: Promise<{ teamId: string }>;
}) {
   const { teamId } = await params;
   return (
      <MainLayout
         header={<div className="w-full border-b px-6 py-3 font-medium">Team projects</div>}
         headersNumber={1}
      >
         <RealProjects teamId={teamId} />
      </MainLayout>
   );
}
