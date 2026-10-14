'use client';
import { Bell } from 'lucide-react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Button as Trigger } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@astryxdesign/core/Button';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { DesignSurface } from '@/components/common/design-surface';
import {
   useNotificationPreferencesStore,
   type NotificationPreferences,
} from '@/store/notification-preferences-store';

const options: { key: keyof NotificationPreferences; label: string }[] = [
   { key: 'teamIssueAdded', label: 'An issue is added to the team' },
   { key: 'issueCompleted', label: 'An issue is completed or canceled' },
   { key: 'issueAddedToTriage', label: 'An issue is added to triage' },
];
export default function Notifications() {
   const state = useNotificationPreferencesStore();
   const { orgId } = useParams<{ orgId: string }>();
   return (
      <Popover
         onOpenChange={(open) => {
            if (open) void state.loadPreferences();
         }}
      >
         <PopoverTrigger asChild>
            <Trigger variant="ghost" size="icon" aria-label="Notification preferences">
               <Bell className="size-4" />
            </Trigger>
         </PopoverTrigger>
         <PopoverContent className="w-80 p-0" align="end">
            <DesignSurface>
               <VStack padding={4} gap={3}>
                  <Heading level={3}>Inbox notifications</Heading>
                  {state.loading && <Text role="status">Loading preferences…</Text>}
                  {options.map(({ key, label }) => (
                     <CheckboxInput
                        key={key}
                        label={label}
                        value={state.preferences[key]}
                        isDisabled={state.loading || state.saving || !state.workspaceId}
                        onChange={(enabled) => void state.updatePreference(key, enabled)}
                     />
                  ))}
                  {state.saving && <Text role="status">Saving…</Text>}
                  {state.error && (
                     <>
                        <Text role="alert">{state.error}</Text>
                        <Button
                           label="Reload preferences"
                           onClick={() => void state.loadPreferences()}
                        />
                     </>
                  )}
                  <Button
                     label="Configure integrations"
                     as={Link}
                     href={`/${orgId}/settings/integrations`}
                  />
               </VStack>
            </DesignSurface>
         </PopoverContent>
      </Popover>
   );
}
