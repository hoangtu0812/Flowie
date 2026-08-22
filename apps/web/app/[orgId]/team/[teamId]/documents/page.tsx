import { RealDocuments } from '@/components/documents/real-documents';
import MainLayout from '@/components/layout/main-layout';

export default async function TeamDocumentsPage({
   params,
}: {
   params: Promise<{ teamId: string }>;
}) {
   const { teamId } = await params;
   return (
      <MainLayout header={<div className="w-full border-b px-6 py-3 font-medium">Documents</div>}>
         <RealDocuments teamId={teamId} />
      </MainLayout>
   );
}
