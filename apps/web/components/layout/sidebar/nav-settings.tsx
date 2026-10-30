'use client';
import { useMessages } from '@/features/shared/use-messages';
import { messages } from '@/features/navigation/messages.vi';

import {
   SidebarGroup,
   SidebarGroupLabel,
   SidebarMenu,
   SidebarMenuButton,
   SidebarMenuItem,
} from '@/components/ui/sidebar';
import {
   Activity,
   Archive,
   ArrowLeftRight,
   Bell,
   Blocks,
   Bot,
   Code,
   Compass,
   FileText,
   Flame,
   Gauge,
   HeartHandshake,
   KeyRound,
   LucideIcon,
   MessageCircleQuestion,
   Repeat,
   Rocket,
   ScrollText,
   Settings,
   SlidersHorizontal,
   Smile,
   Sparkles,
   Tag,
   Target,
   UserRound,
   Users,
   Zap,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { loadCurrentWorkspaceMembership } from '@/lib/workspaces';

interface SettingsNavItem {
   name: string;
   /** Path under /{orgId}. */
   url: string;
   icon: LucideIcon;
}

interface SettingsNavGroup {
   label: string;
   items: SettingsNavItem[];
}

/**
 * Settings navigation, ordered from the person to the workspace to optional modules: Account
 * first (/settings opens on Preferences), then workspace administration, issue and project
 * configuration, product features, and AI with the integrations it relies on. Every settings
 * page is listed here so none is reachable only through another page's link.
 * VI: Điều hướng Settings, xếp từ cá nhân đến workspace rồi các module tùy chọn: Account đứng
 * VI: đầu (/settings mở vào Preferences), sau đó quản trị workspace, cấu hình issue và dự án,
 * VI: các tính năng sản phẩm, cuối cùng là AI cùng các tích hợp nó dùng. Mọi trang settings
 * VI: đều có ở đây để không trang nào chỉ mở được qua link trong trang khác.
 */
export const settingsNav: SettingsNavGroup[] = [
   {
      label: 'Account',
      items: [
         { name: 'Profile', url: '/settings/profile', icon: UserRound },
         { name: 'Preferences', url: '/settings/preferences', icon: Settings },
         { name: 'Notifications', url: '/settings/notifications', icon: Bell },
         { name: 'Security & access', url: '/settings/security', icon: KeyRound },
         { name: 'Connected accounts', url: '/settings/connected-accounts', icon: Users },
         { name: 'Agent personalization', url: '/settings/agent-personalization', icon: Bot },
      ],
   },
   {
      label: 'Workspace',
      items: [
         { name: 'General', url: '/settings/workspace', icon: Settings },
         { name: 'Import and export', url: '/settings/data-exchange', icon: ArrowLeftRight },
         { name: 'Archived records', url: '/settings/archive', icon: Archive },
         { name: 'Audit log', url: '/settings/audit', icon: ScrollText },
         { name: 'Operations', url: '/settings/operations', icon: Activity },
      ],
   },
   {
      label: 'Issues',
      items: [
         { name: 'Statuses', url: '/settings/issue-statuses', icon: Target },
         { name: 'Labels', url: '/settings/issue-labels', icon: Tag },
         { name: 'Templates', url: '/settings/issue-templates', icon: FileText },
         { name: 'SLAs', url: '/settings/slas', icon: Flame },
         { name: 'Recurring schedules', url: '/settings/recurring', icon: Repeat },
      ],
   },
   {
      label: 'Projects',
      items: [
         { name: 'Statuses', url: '/settings/project-statuses', icon: Target },
         { name: 'Labels', url: '/settings/project-labels', icon: Tag },
         { name: 'Templates', url: '/settings/project-templates', icon: FileText },
         { name: 'Properties', url: '/settings/project-properties', icon: SlidersHorizontal },
         { name: 'Updates', url: '/settings/project-updates', icon: Zap },
      ],
   },
   {
      label: 'Features',
      items: [
         { name: 'Initiatives', url: '/settings/initiatives', icon: Compass },
         { name: 'Documents', url: '/settings/documents', icon: FileText },
         { name: 'Releases', url: '/settings/releases', icon: Rocket },
         { name: 'Customer requests', url: '/settings/customer-requests', icon: HeartHandshake },
         { name: 'Asks', url: '/settings/asks', icon: MessageCircleQuestion },
         { name: 'Pulse', url: '/settings/pulse', icon: Zap },
         { name: 'Emojis', url: '/settings/emojis', icon: Smile },
      ],
   },
   {
      label: 'AI & integrations',
      items: [
         { name: 'AI & Agents', url: '/settings/ai', icon: Sparkles },
         { name: 'AI operations', url: '/settings/ai-operations', icon: Gauge },
         { name: 'Integrations', url: '/settings/integrations', icon: Blocks },
         { name: 'MCP logs', url: '/settings/mcp-logs', icon: ScrollText },
         { name: 'Code & reviews', url: '/settings/code-and-reviews', icon: Code },
      ],
   },
];

// Administrator pages stay out of members' navigation; the API enforces the same rule.
// VI: Trang dành cho quản trị viên không hiện với thành viên; API cũng áp dụng quy tắc này.
export const ADMIN_ONLY = new Set([
   '/settings/operations',
   '/settings/audit',
   '/settings/ai-operations',
]);

export function NavSettings() {
   const tx = useMessages(messages);
   const { orgId } = useParams<{ orgId: string }>();
   const pathname = usePathname();
   const [adminScope, setAdminScope] = useState('');
   useEffect(() => {
      let current = true;
      void loadCurrentWorkspaceMembership(orgId)
         .then((member) => {
            if (current) setAdminScope(member.role === 'MEMBER' ? '' : orgId);
         })
         .catch(() => {
            if (current) setAdminScope('');
         });
      return () => {
         current = false;
      };
   }, [orgId]);

   return (
      <>
         {settingsNav.map((group) => (
            <SidebarGroup key={tx(group.label)} className="group-data-[collapsible=icon]:hidden">
               <SidebarGroupLabel>{tx(group.label)}</SidebarGroupLabel>
               <SidebarMenu>
                  {group.items
                     .filter((item) => !ADMIN_ONLY.has(item.url) || adminScope === orgId)
                     .map((item) => {
                        const href = `/${orgId}${item.url}`;
                        const isActive = pathname === href;
                        return (
                           <SidebarMenuItem key={`${tx(group.label)}-${tx(item.name)}`}>
                              <SidebarMenuButton asChild isActive={isActive}>
                                 <Link href={href}>
                                    <item.icon className="size-4" />
                                    <span>{tx(item.name)}</span>
                                 </Link>
                              </SidebarMenuButton>
                           </SidebarMenuItem>
                        );
                     })}
               </SidebarMenu>
            </SidebarGroup>
         ))}
      </>
   );
}
