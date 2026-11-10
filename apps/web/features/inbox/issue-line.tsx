'use client';

import { InboxItem } from '@/store/notifications-store';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { initials } from '@/lib/initials';
import { cn } from '@/lib/utils';
import { motion } from 'motion/react';
import { getNotificationIcon } from '@/lib/notification-utils';

interface IssueLineProps {
   notification: InboxItem;
   layoutId?: boolean;
   isSelected?: boolean;
   onClick?: () => void;
   showId?: boolean;
   showStatusIcon?: boolean;
}

export default function IssueLine({
   notification,
   layoutId = false,
   isSelected = false,
   onClick,
   showId = true,
   showStatusIcon = true,
}: IssueLineProps) {
   return (
      <motion.div
         {...(layoutId && { layoutId: `notification-line-${notification.id}` })}
         role="button"
         tabIndex={0}
         aria-label={`Open notification: ${notification.title}`}
         aria-pressed={isSelected}
         onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
               event.preventDefault();
               onClick?.();
            }
         }}
         onClick={onClick}
         className="w-full px-0.75 py-0.25"
      >
         <div
            className={cn(
               'w-full flex items-center gap-3 px-3 py-2.5 hover:bg-sidebar/80 dark:hover:bg-sidebar/50 transition-colors cursor-pointer rounded-lg',
               isSelected && 'bg-accent/80 dark:bg-accent/50'
            )}
         >
            <div className="relative flex-shrink-0">
               <Avatar className="size-8">
                  <AvatarImage src={notification.user.avatarUrl} alt={notification.user.name} />
                  <AvatarFallback className="text-xs">
                     {initials(notification.user.name)}
                  </AvatarFallback>
               </Avatar>

               <div className="absolute -bottom-1 -right-1 size-5 rounded-full bg-accent border-2 border-background flex items-center justify-center">
                  {getNotificationIcon(notification.type, 'size-3')}
               </div>
            </div>

            {/* min-w-0 lets this flex item shrink below its text width, so long titles and
                unbroken strings truncate and the status and time stay at the right edge.
                VI: min-w-0 cho phép khối này co nhỏ hơn độ rộng chữ, nên tiêu đề dài và chuỗi
                không khoảng trắng bị cắt, còn trạng thái và thời gian nằm ở mép phải. */}
            <div className="min-w-0 flex-1">
               <div className="flex items-center gap-1.5">
                  {!notification.read && (
                     <div className="size-2 bg-blue-500 rounded-full flex-shrink-0" />
                  )}
                  {showId && (
                     <span
                        className={cn(
                           'text-sm font-medium text-muted-foreground shrink-0',
                           notification.read && 'opacity-50'
                        )}
                     >
                        {notification.identifier}
                     </span>
                  )}

                  <h4
                     className={cn(
                        'text-sm font-medium text-foreground truncate min-w-0 flex-1',
                        notification.read && 'opacity-50'
                     )}
                  >
                     {notification.title}
                  </h4>

                  {showStatusIcon && (
                     <div className="shrink-0">
                        <notification.status.icon />
                     </div>
                  )}
               </div>

               <div
                  className={cn(
                     'flex items-center justify-between gap-1.5 transition-opacity duration-200',
                     notification.read && 'opacity-50'
                  )}
               >
                  <p className="text-sm text-muted-foreground truncate min-w-0 flex-1">
                     {notification.content}
                  </p>
                  <span className="text-xs text-muted-foreground shrink-0">
                     {notification.timestamp}
                  </span>
               </div>
            </div>
         </div>
      </motion.div>
   );
}
