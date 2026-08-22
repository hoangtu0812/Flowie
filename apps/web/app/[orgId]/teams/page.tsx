import MainLayout from '@/components/layout/main-layout';
import { RealTeams } from '@/components/teams/real-teams';

export default function TeamsPage() {
   return (
      <MainLayout header={<div className="px-6 py-3 font-semibold">Teams</div>} headersNumber={1}>
         <RealTeams />
      </MainLayout>
   );
}
