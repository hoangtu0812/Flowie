import AllIssues from '@/components/common/issues/all-issues';
import Header from '@/components/layout/headers/issues/header';
import MainLayout from '@/components/layout/main-layout';
import { workspaceIssueViews } from '@/features/issues/workspace-views';
import { notFound } from 'next/navigation';

export default async function WorkspaceIssuesPage({
   params,
}: {
   params: Promise<{ view?: string[] }>;
}) {
   const { view } = await params;
   const selected = workspaceIssueViews.find((item) => item.segment === (view?.join('/') ?? ''));
   if (!selected) notFound();
   return (
      <MainLayout header={<Header />}>
         <AllIssues categories={selected.categories} query={selected.query} />
      </MainLayout>
   );
}
