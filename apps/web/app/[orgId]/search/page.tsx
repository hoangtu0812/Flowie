import MainLayout from '@/components/layout/main-layout';
import { SearchHeader, WorkspaceSearch } from '@/features/search/workspace-search';
export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
   return (
      <MainLayout header={<SearchHeader />} headersNumber={1}>
         <WorkspaceSearch initialQuery={(await searchParams).q ?? ''} />
      </MainLayout>
   );
}
