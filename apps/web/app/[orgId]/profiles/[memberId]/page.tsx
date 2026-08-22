import MemberProfile from '@/components/common/members/member-profile';
import Header from '@/components/layout/headers/profile/header';
import MainLayout from '@/components/layout/main-layout';

interface MemberProfilePageProps {
   params: Promise<{ memberId: string }>;
}

export default async function MemberProfilePage({ params }: MemberProfilePageProps) {
   const { memberId } = await params;

   return (
      <MainLayout header={<Header memberId={memberId} />}>
         <MemberProfile memberId={memberId} />
      </MainLayout>
   );
}
