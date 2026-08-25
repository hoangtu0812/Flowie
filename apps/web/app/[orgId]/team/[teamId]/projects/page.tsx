import TeamProjects from '@/components/common/teams/team-projects';
import Header from '@/components/layout/headers/team-projects/header';
import MainLayout from '@/components/layout/main-layout';
import { ProjectsDataProvider } from '@/features/projects/projects-data';

export default async function TeamProjectsPage({
   params,
}: {
   params: Promise<{ teamId: string }>;
}) {
   const { teamId } = await params;
   return (
      <ProjectsDataProvider teamIdentifier={teamId}>
         <MainLayout header={<Header />} headersNumber={1}>
            <TeamProjects teamId={teamId} />
         </MainLayout>
      </ProjectsDataProvider>
   );
}
