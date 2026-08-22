import { RealCycles } from '@/components/cycles/real-cycles';
import MainLayout from '@/components/layout/main-layout';

export default async function CyclesPage({ params }: { params: Promise<{ teamId: string }> }) {
   const { teamId } = await params;
   return (
      <MainLayout
         header={<div className="w-full border-b px-6 py-3 font-medium">Cycles</div>}
         headersNumber={1}
      >
         <RealCycles teamId={teamId} />
      </MainLayout>
   );
}
