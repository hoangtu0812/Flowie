import { WorkspaceSearch } from '@/features/search/workspace-search';
export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
   return <WorkspaceSearch initialQuery={(await searchParams).q ?? ''} />;
}
