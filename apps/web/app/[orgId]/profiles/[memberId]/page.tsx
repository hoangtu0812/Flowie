import { MemberProfilePage } from '@/features/members/member-profile-page';

export default async function ProfilePage({ params }: { params: Promise<{ memberId: string }> }) {
   const { memberId } = await params;
   return <MemberProfilePage memberId={memberId} />;
}
