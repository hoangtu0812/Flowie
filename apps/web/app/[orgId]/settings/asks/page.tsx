import { redirect } from 'next/navigation';

// Asks moved to Service Desk; old bookmarks keep working.
// VI: Asks đã chuyển sang Service Desk; bookmark cũ vẫn dùng được.
export default async function AsksSettingsPage({ params }: { params: Promise<{ orgId: string }> }) {
   const { orgId } = await params;
   redirect(`/${orgId}/service-desk`);
}
