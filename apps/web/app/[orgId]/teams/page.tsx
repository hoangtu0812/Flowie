import Teams from '@/components/common/teams/teams';
import Header from '@/components/layout/headers/teams/header';
import MainLayout from '@/components/layout/main-layout';
import { TeamsDataProvider } from '@/features/teams/teams-data';

export default function TeamsPage() {
   return (
      <TeamsDataProvider>
         <MainLayout header={<Header />} headersNumber={1}>
            <Teams />
         </MainLayout>
      </TeamsDataProvider>
   );
}
