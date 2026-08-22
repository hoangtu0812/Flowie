import { RealCycles } from '@/components/cycles/real-cycles';
import Header from '@/components/layout/headers/cycles/header';
import MainLayout from '@/components/layout/main-layout';

export default async function ActiveCyclePage({ params }: { params: Promise<{ teamId: string }> }) {
   const { teamId } = await params;
   return (
      <MainLayout header={<Header />}>
         <RealCycles status="ACTIVE" teamId={teamId} />
      </MainLayout>
   );
}
