import { RealMemberProfile } from '@/components/members/real-member-profile';
import MainLayout from '@/components/layout/main-layout';

interface MemberProfilePageProps {
   params: Promise<{ memberId: string }>;
}

export default async function MemberProfilePage({ params }: MemberProfilePageProps) {
   const { memberId } = await params;
   return (
      <MainLayout header={<div className="w-full border-b px-6 py-3 font-medium">Profile</div>}>
         <RealMemberProfile memberId={memberId} />
      </MainLayout>
   );
}
