'use client';

import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { useEffect } from 'react';
import { useNotificationPreferencesStore } from '@/store/notification-preferences-store';
import { toast } from 'sonner';

export default function Notifications() {
   const {
      preferences: notifications,
      loadPreferences,
      updatePreference,
   } = useNotificationPreferencesStore();

   const handleCheckboxChange = (key: keyof typeof notifications) => {
      void updatePreference(key, !notifications[key]).catch(() => {
         toast.error('Could not save notification preferences.');
      });
   };

   useEffect(() => {
      void loadPreferences().catch(() => {
         toast.error('Could not load notification preferences.');
      });
   }, [loadPreferences]);

   return (
      <Popover>
         <PopoverTrigger asChild>
            <Button
               variant="ghost"
               size="icon"
               className="h-8 w-8 relative"
               aria-label="Notifications"
            >
               <Bell className="h-4 w-4" />
            </Button>
         </PopoverTrigger>
         <PopoverContent className="w-80 p-0" align="end">
            <div className="px-4 pt-3 pb-3">
               <h3 className="text-sm font-medium mb-3">Inbox notifications</h3>

               <div className="space-y-4">
                  <div className="flex items-center justify-between">
                     <label
                        htmlFor="team-issue-added"
                        className="text-xs text-muted-foreground cursor-pointer flex-1"
                     >
                        An issue is added to the team
                     </label>
                     <Checkbox
                        id="team-issue-added"
                        checked={notifications.teamIssueAdded}
                        onCheckedChange={() => handleCheckboxChange('teamIssueAdded')}
                     />
                  </div>

                  <div className="flex items-center justify-between">
                     <label
                        htmlFor="issue-completed"
                        className="text-xs text-muted-foreground cursor-pointer flex-1"
                     >
                        An issue is marked completed or canceled
                     </label>
                     <Checkbox
                        id="issue-completed"
                        checked={notifications.issueCompleted}
                        onCheckedChange={() => handleCheckboxChange('issueCompleted')}
                     />
                  </div>

                  <div className="flex items-center justify-between">
                     <label
                        htmlFor="issue-triage"
                        className="text-xs text-muted-foreground cursor-pointer flex-1"
                     >
                        An issue is added to the triage queue
                     </label>
                     <Checkbox
                        id="issue-triage"
                        checked={notifications.issueAddedToTriage}
                        onCheckedChange={() => handleCheckboxChange('issueAddedToTriage')}
                     />
                  </div>
               </div>
            </div>
         </PopoverContent>
      </Popover>
   );
}
