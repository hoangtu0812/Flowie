'use client';
import { useEffect, useState, useRef } from 'react';
import { Text } from '@astryxdesign/core/Text';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { RefreshIconButton } from '@/features/shared/refresh-icon-button';
import { DesignSurface } from '@/components/common/design-surface';
import { authenticatedFetch, loadCurrentWorkspace } from '@/lib/workspaces';
import { responseData } from '@/lib/http';
import { SubmissionGate } from '@/features/shared/submission-gate';
import { useParams } from 'next/navigation';
import {
   SettingsCard,
   SettingsRow,
   SettingsSection,
   SettingsShell,
} from '@/components/common/settings/shared';
type ChannelState = {
   emailAvailable: boolean;
   emailEnabled: boolean;
   desktopEnabled: boolean;
   teamsAvailable: boolean;
   teamsEnabled: boolean;
   ticketEmailEnabled: boolean;
};
type Channels = Pick<
   ChannelState,
   'emailEnabled' | 'desktopEnabled' | 'teamsEnabled' | 'ticketEmailEnabled'
>;
type Delivery = {
   notificationId: string;
   attempts: number;
   deliveredAt?: string;
   failedAt?: string;
   lastErrorCode?: string;
   retryAt: string;
};
const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
export function ChannelSettings() {
   const { orgId } = useParams<{ orgId: string }>();
   const [workspace, setWorkspace] = useState<string>(),
      [state, setState] = useState<ChannelState>(),
      [deliveries, setDeliveries] = useState<Delivery[]>([]);
   const [error, setError] = useState<string>(),
      [saving, setSaving] = useState(false),
      [reload, setReload] = useState(0);
   const gate = useRef(new SubmissionGate());
   useEffect(() => {
      let active = true;
      setError(undefined);
      setWorkspace(undefined);
      setState(undefined);
      setDeliveries([]);
      void (async () => {
         try {
            const ws = await loadCurrentWorkspace();
            const query = new URLSearchParams({ workspaceId: ws.id });
            const [channels, delivery] = await Promise.all([
               authenticatedFetch(`${api}/notifications/channels?${query}`).then(
                  responseData<ChannelState>
               ),
               authenticatedFetch(`${api}/notifications/delivery-status?${query}`).then(
                  responseData<Delivery[]>
               ),
            ]);
            if (active) {
               setWorkspace(ws.id);
               setState(channels);
               setDeliveries(delivery);
            }
         } catch (reason) {
            if (active)
               setError(
                  reason instanceof Error ? reason.message : 'Could not load notification settings.'
               );
         }
      })();
      return () => {
         active = false;
      };
   }, [reload, orgId]);
   const save = (changes: Partial<Channels>) =>
      gate.current.run(async () => {
         if (!workspace || !state) return;
         const next = { ...state, ...changes };
         const channels: Channels = {
            emailEnabled: next.emailEnabled,
            desktopEnabled: next.desktopEnabled,
            teamsEnabled: next.teamsEnabled,
            ticketEmailEnabled: next.ticketEmailEnabled,
         };
         setSaving(true);
         setError(undefined);
         setState(next);
         try {
            if (changes.desktopEnabled) {
               if (!('Notification' in window))
                  throw new Error('Desktop notifications are not supported by this browser.');
               const permission =
                  Notification.permission === 'granted'
                     ? 'granted'
                     : await Notification.requestPermission();
               if (permission !== 'granted')
                  throw new Error('Desktop notification permission was not granted.');
            }
            if ((await loadCurrentWorkspace()).id !== workspace)
               throw new Error('Workspace changed. Reload notification settings.');
            await responseData(
               await authenticatedFetch(
                  `${api}/notifications/channels?${new URLSearchParams({ workspaceId: workspace })}`,
                  {
                     method: 'PUT',
                     headers: { 'content-type': 'application/json' },
                     body: JSON.stringify(channels),
                  }
               )
            );
            setState(next);
         } catch (reason) {
            setState(state);
            setError(
               reason instanceof Error ? reason.message : 'Could not save notification settings.'
            );
         } finally {
            setSaving(false);
         }
      });
   const channel = (
      label: string,
      description: string,
      value: boolean,
      isDisabled: boolean,
      changes: (checked: boolean) => Partial<Channels>
   ) => (
      <SettingsRow
         title={label}
         description={description}
         muted={isDisabled && !saving}
         trailing={
            <CheckboxInput
               label={label}
               isLabelHidden
               value={value}
               isDisabled={isDisabled}
               onChange={(checked) => {
                  void save(changes(checked));
               }}
            />
         }
      />
   );
   return (
      <DesignSurface>
         <SettingsShell
            title="Notifications"
            description="Choose how Flowie delivers notifications to you"
            action={
               <RefreshIconButton
                  label="Refresh delivery status"
                  onClick={() => setReload((n) => n + 1)}
               />
            }
         >
            {(!state || error || saving) && (
               <div className="flex flex-col gap-1 text-sm">
                  {!state && !error && <Text role="status">Loading notification settings…</Text>}
                  {error && <Text role="alert">{error}</Text>}
                  {saving && <Text role="status">Saving…</Text>}
               </div>
            )}
            {state && (
               <SettingsCard>
                  {channel(
                     'Email notifications',
                     state.emailAvailable
                        ? 'Email is delivered privately with retries.'
                        : 'Private SMTP delivery is not configured.',
                     state.emailEnabled,
                     !state.emailAvailable || saving,
                     (checked) => ({ emailEnabled: checked })
                  )}
                  {channel(
                     'Email about my tickets',
                     'Replies and status changes on Service Desk tickets you raised, even when email notifications are off.',
                     state.ticketEmailEnabled,
                     !state.emailAvailable || saving,
                     (checked) => ({ ticketEmailEnabled: checked })
                  )}
                  {channel(
                     'Desktop notifications',
                     'Desktop alerts require permission on each browser and appear while Flowie is in the background. Notification contents are kept private.',
                     state.desktopEnabled,
                     saving,
                     (checked) => ({ desktopEnabled: checked })
                  )}
                  {channel(
                     'Microsoft Teams',
                     state.teamsAvailable
                        ? 'When you are assigned an issue or mentioned in a comment, Flowie @mentions you in the Teams channel of the project, or of the workspace when the project has none.'
                        : 'Teams is available when Microsoft sign-in is enabled.',
                     state.teamsEnabled,
                     !state.teamsAvailable || saving,
                     (checked) => ({ teamsEnabled: checked })
                  )}
               </SettingsCard>
            )}
            <SettingsSection
               title="Email delivery"
               description="Up to 50 recent delivery records. Transient failures retry; delivery can be at least once."
            >
               <SettingsCard>
                  {deliveries.length === 0 && (
                     <SettingsRow title="No email delivery records." muted />
                  )}
                  {deliveries.map((item) => (
                     <SettingsRow
                        key={item.notificationId}
                        title={
                           item.deliveredAt ? 'Delivered' : item.failedAt ? 'Stopped' : 'Pending'
                        }
                        description={item.lastErrorCode}
                        trailing={`attempts ${item.attempts}`}
                     />
                  ))}
               </SettingsCard>
            </SettingsSection>
            <p className="text-xs text-muted-foreground">
               Discord and Microsoft Teams are configured in workspace Integrations; Teams is
               available when Microsoft sign-in is enabled. Native mobile and Slack delivery require
               separate integrations.
            </p>
         </SettingsShell>
      </DesignSurface>
   );
}
