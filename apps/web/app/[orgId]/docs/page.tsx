import MainLayout from '@/components/layout/main-layout';
import { ProjectsDataProvider } from '@/features/projects/projects-data';
import { WorkspaceDocs, WorkspaceDocsHeader } from '@/features/documents/workspace-docs';

export default function DocsPage() {
   return (
      <ProjectsDataProvider>
         <MainLayout header={<WorkspaceDocsHeader />} headersNumber={1}>
            <WorkspaceDocs />
         </MainLayout>
      </ProjectsDataProvider>
   );
}
