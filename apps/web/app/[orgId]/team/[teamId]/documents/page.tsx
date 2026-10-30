import TeamDocuments from '@/components/common/teams/team-documents';
import Header from '@/components/layout/headers/team/header';
import MainLayout from '@/components/layout/main-layout';
import { ProjectsDataProvider } from '@/features/projects/projects-data';

export default async function TeamDocumentsPage({
   params,
}: {
   params: Promise<{ teamId: string }>;
}) {
   const { teamId } = await params;
   return (
      <ProjectsDataProvider teamIdentifier={teamId}>
         <MainLayout header={<Header />}>
            <TeamDocuments />
         </MainLayout>
      </ProjectsDataProvider>
   );
}
