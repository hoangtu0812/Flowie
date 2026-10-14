'use client';
import { useLocale } from '@/features/shared/use-locale';

import { useEffect, useState } from 'react';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { useNotificationsStore } from '@/store/notifications-store';
import { Button } from '@/components/ui/button';
import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuSeparator,
   DropdownMenuTrigger,
   DropdownMenuLabel,
   DropdownMenuCheckboxItem,
} from '@/components/ui/dropdown-menu';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
   MoreHorizontal,
   SlidersHorizontal,
   Trash2,
   CheckCheck,
   Archive,
   ArrowUpDown,
} from 'lucide-react';
import NotificationPreview from './issue-preview';
import IssueLine from './issue-line';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { useIsMobile } from '@/hooks/use-mobile';
import { ChevronLeft } from 'lucide-react';
import { orderNotifications } from '@/features/inbox/notification-order';
import { QueryState } from '@/components/common/query-state';
import { LoadingState } from '@/components/common/loading-state';

export default function Inbox() {
   const { t } = useLocale();
   const {
      notifications,
      loading,
      includeSnoozed,
      setIncludeSnoozed,
      error,
      selectedNotification,
      setSelectedNotification,
      markAsRead,
      markAllAsRead,
      loadNotifications,
      deleteAll,
      deleteRead,
      deleteCompletedIssues,
      getUnreadNotifications,
   } = useNotificationsStore();

   const isMobile = useIsMobile();
   const [showRead, setShowRead] = useState(true);
   const [showUnreadFirst, setShowUnreadFirst] = useState(false);
   const [ordering, setOrdering] = useState('newest');
   const [showId, setShowId] = useState(true);
   const [showStatusIcon, setShowStatusIcon] = useState(true);

   useEffect(() => {
      void loadNotifications();
   }, [loadNotifications]);
   const filteredNotifications = orderNotifications(
      notifications.filter((notification) => showRead || !notification.read),
      ordering === 'newest',
      showUnreadFirst
   );

   const handleDeleteAllNotifications = () => void deleteAll();

   const handleDeleteReadNotifications = () => void deleteRead();

   const handleDeleteCompletedIssues = () => void deleteCompletedIssues();

   const listPane = (
      <>
         <div className="flex items-center justify-between px-4 h-10 border-b border-border">
            <div className="flex items-center gap-2">
               <SidebarTrigger className="inline-flex lg:hidden" />
               <h2 className="text-lg font-semibold">{t('inbox')}</h2>
               <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                     <Button variant="ghost" size="xs" aria-label={t('notificationActions')}>
                        <MoreHorizontal className="w-4 h-4" />
                     </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                     <DropdownMenuItem onClick={handleDeleteAllNotifications}>
                        <Trash2 className="w-4 h-4 mr-2" />
                        {t('deleteAllNotifications')}
                     </DropdownMenuItem>
                     <DropdownMenuItem onClick={handleDeleteReadNotifications}>
                        <CheckCheck className="w-4 h-4 mr-2" />
                        {t('deleteReadNotifications')}
                     </DropdownMenuItem>
                     <DropdownMenuItem onClick={handleDeleteCompletedIssues}>
                        <Archive className="w-4 h-4 mr-2" />
                        {t('deleteCompletedNotifications')}
                     </DropdownMenuItem>
                  </DropdownMenuContent>
               </DropdownMenu>
            </div>

            <div className="flex items-center gap-2">
               <Button
                  variant="ghost"
                  size="xs"
                  aria-label={t('markAllRead')}
                  onClick={markAllAsRead}
                  disabled={getUnreadNotifications().length === 0}
               >
                  <CheckCheck className="w-4 h-4" />
               </Button>
               <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                     <Button variant="ghost" size="xs" aria-label={t('notificationDisplay')}>
                        <SlidersHorizontal className="w-4 h-4" />
                     </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-64">
                     <DropdownMenuLabel className="flex items-center gap-2">
                        <ArrowUpDown className="w-4 h-4" />
                        {t('ordering')}
                     </DropdownMenuLabel>
                     <DropdownMenuCheckboxItem
                        checked={ordering === 'newest'}
                        onCheckedChange={() => setOrdering('newest')}
                     >
                        {t('newest')}
                     </DropdownMenuCheckboxItem>
                     <DropdownMenuCheckboxItem
                        checked={ordering === 'oldest'}
                        onCheckedChange={() => setOrdering('oldest')}
                     >
                        {t('oldest')}
                     </DropdownMenuCheckboxItem>

                     <DropdownMenuSeparator />

                     <div className="p-2 space-y-3">
                        <div className="flex items-center justify-between">
                           <Label htmlFor="show-snoozed" className="text-sm">
                              {t('showSnoozed')}
                           </Label>
                           <Switch
                              id="show-snoozed"
                              checked={includeSnoozed}
                              onCheckedChange={setIncludeSnoozed}
                           />
                        </div>
                        <div className="flex items-center justify-between">
                           <Label htmlFor="show-read" className="text-sm">
                              {t('showRead')}
                           </Label>
                           <Switch
                              id="show-read"
                              checked={showRead}
                              onCheckedChange={setShowRead}
                           />
                        </div>
                        <div className="flex items-center justify-between">
                           <Label htmlFor="show-unread-first" className="text-sm">
                              {t('showUnreadFirst')}
                           </Label>
                           <Switch
                              id="show-unread-first"
                              checked={showUnreadFirst}
                              onCheckedChange={setShowUnreadFirst}
                           />
                        </div>
                     </div>

                     <DropdownMenuSeparator />

                     <DropdownMenuLabel>{t('displayProperties')}</DropdownMenuLabel>
                     <div className="p-2 space-y-3">
                        <div className="flex items-center justify-between">
                           <Label htmlFor="show-id" className="text-sm">
                              ID
                           </Label>
                           <Switch id="show-id" checked={showId} onCheckedChange={setShowId} />
                        </div>
                        <div className="flex items-center justify-between">
                           <Label htmlFor="show-status-icon" className="text-sm">
                              {t('statusIcon')}
                           </Label>
                           <Switch
                              id="show-status-icon"
                              checked={showStatusIcon}
                              onCheckedChange={setShowStatusIcon}
                           />
                        </div>
                     </div>
                  </DropdownMenuContent>
               </DropdownMenu>
            </div>
         </div>
         <div className="w-full flex flex-col items-center justify-start overflow-y-scroll h-[calc(100%-40px)] pb-0.25">
            {loading && notifications.length === 0 && (
               <LoadingState label={t('loadingNotifications')} />
            )}
            {error && <QueryState message={error} onRetry={loadNotifications} />}
            {!loading && !error && filteredNotifications.length === 0 && (
               <p className="py-12 text-sm text-muted-foreground">{t('noNotifications')}</p>
            )}
            {filteredNotifications.map((notification) => (
               <IssueLine
                  key={notification.id}
                  notification={notification}
                  isSelected={selectedNotification?.id === notification.id}
                  onClick={() => setSelectedNotification(notification)}
                  showId={showId}
                  showStatusIcon={showStatusIcon}
               />
            ))}
         </div>
      </>
   );

   if (isMobile) {
      return selectedNotification ? (
         <div className="flex flex-col h-full w-full">
            <button
               onClick={() => setSelectedNotification(undefined)}
               className="flex items-center gap-1 px-4 h-10 border-b border-border text-sm text-muted-foreground hover:text-foreground shrink-0"
            >
               <ChevronLeft className="size-4" />
               {t('inbox')}
            </button>
            <div className="flex-1 min-h-0">
               <NotificationPreview notification={selectedNotification} onMarkAsRead={markAsRead} />
            </div>
         </div>
      ) : (
         <div className="flex flex-col h-full w-full">{listPane}</div>
      );
   }

   return (
      <ResizablePanelGroup
         direction="horizontal"
         autoSaveId="inbox-panel-group"
         className="w-full h-full"
      >
         <ResizablePanel defaultSize={350} maxSize={500}>
            {listPane}
         </ResizablePanel>
         <ResizableHandle withHandle />
         <ResizablePanel defaultSize={350} maxSize={500}>
            <NotificationPreview notification={selectedNotification} onMarkAsRead={markAsRead} />
         </ResizablePanel>
      </ResizablePanelGroup>
   );
}
