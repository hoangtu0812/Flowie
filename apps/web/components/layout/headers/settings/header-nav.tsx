'use client';
import { useMessages } from '@/features/shared/use-messages';
import { messages } from '@/features/navigation/messages.vi';

import { SidebarTrigger } from '@/components/ui/sidebar';
import { settingsNav } from '@/components/layout/sidebar/nav-settings';
import { findSettingsPage } from '@/lib/settings-nav';
import { ChevronRight } from 'lucide-react';
import { useParams, usePathname } from 'next/navigation';

/**
 * Settings header with a "Settings › Group › Page" trail taken from the sidebar navigation,
 * so every settings page states where it is; unlisted pages such as team settings show only
 * "Settings".
 * VI: Header Settings có đường dẫn "Settings › Nhóm › Trang" lấy từ sidebar, để mọi trang
 * VI: settings cho biết đang ở đâu; trang không có trong nav như settings team chỉ hiện
 * VI: "Settings".
 */
export default function HeaderNav() {
   const tx = useMessages(messages);
   const { orgId } = useParams<{ orgId: string }>();
   const page = findSettingsPage(settingsNav, orgId, usePathname());
   return (
      <div className="w-full flex justify-between items-center border-b py-1.5 px-6 h-10">
         <div className="flex min-w-0 items-center gap-2">
            <SidebarTrigger className="" />
            <nav aria-label={tx('Settings')} className="flex min-w-0 items-center gap-1 text-sm">
               <span className={page ? 'text-muted-foreground' : 'font-medium'}>
                  {tx('Settings')}
               </span>
               {page && (
                  <>
                     <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                     <span className="text-muted-foreground">{tx(page.group.label)}</span>
                     <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                     <span aria-current="page" className="truncate font-medium">
                        {tx(page.item.name)}
                     </span>
                  </>
               )}
            </nav>
         </div>
      </div>
   );
}
