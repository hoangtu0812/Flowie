import { RealMembers } from '@/components/members/real-members';
import MainLayout from '@/components/layout/main-layout';

export default function MembersPage() {
   return (
      <MainLayout header={<div className="w-full border-b px-6 py-3 font-medium">Members</div>}>
         <RealMembers />
      </MainLayout>
   );
}
