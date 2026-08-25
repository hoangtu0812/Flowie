import Members from '@/components/common/members/members';
import Header from '@/components/layout/headers/members/header';
import MainLayout from '@/components/layout/main-layout';
import { MembersDataProvider } from '@/features/members/members-data';

export default function MembersPage() {
   return (
      <MembersDataProvider>
         <MainLayout header={<Header />}>
            <Members />
         </MainLayout>
      </MembersDataProvider>
   );
}
