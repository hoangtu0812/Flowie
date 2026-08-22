import MainLayout from '@/components/layout/main-layout';
import { RealInbox } from '@/components/notifications/real-inbox';

export default function InboxPage() {
   return (
      <MainLayout header={<div className="w-full border-b px-6 py-3 font-medium">Inbox</div>}>
         <RealInbox />
      </MainLayout>
   );
}
