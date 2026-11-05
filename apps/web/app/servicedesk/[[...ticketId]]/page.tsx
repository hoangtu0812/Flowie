import { Suspense } from 'react';
import { ServiceDeskPortal } from '@/features/service-desk/portal-page';

// Set on the server too: a page outside a workspace has no later title change to win a race with Next.
// VI: Đặt cả ở server: trang ngoài workspace không có lần đổi title sau đó để thắng race với Next.
export const metadata = { title: 'Service Desk | Flowie' };

export default function Page() {
   return (
      <Suspense>
         <ServiceDeskPortal />
      </Suspense>
   );
}
