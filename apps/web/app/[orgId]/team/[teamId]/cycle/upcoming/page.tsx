import { RealCycles } from '@/components/cycles/real-cycles';
import Header from '@/components/layout/headers/cycles/header';
import MainLayout from '@/components/layout/main-layout';

export default async function UpcomingCyclePage({
   params,
}: {
   params: Promise<{ teamId: string }>;
}) {
   const { teamId } = await params;
   return (
      <MainLayout header={<Header />}>
         <RealCycles status="UPCOMING" teamId={teamId} />
      </MainLayout>
   );
}
