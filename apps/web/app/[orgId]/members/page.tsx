import { RealMembers } from '@/components/members/real-members';
import Header from '@/components/layout/headers/members/header';
import MainLayout from '@/components/layout/main-layout';

export default function MembersPage() {
   return (
      <MainLayout header={<Header />} headersNumber={2}>
         <RealMembers />
      </MainLayout>
   );
}
