'use client';
import { useEffect, useState, useRef } from 'react';
import { VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { Button } from '@astryxdesign/core/Button';
import { DesignSurface } from '@/components/common/design-surface';
import { authenticatedFetch, loadCurrentWorkspace } from '@/lib/workspaces';
import { responseData } from '@/lib/http';
import { SubmissionGate } from '@/features/shared/submission-gate';
import { useParams } from 'next/navigation';
import { SettingsShell } from '@/components/common/settings/shared';
type ChannelState = { emailAvailable: boolean; emailEnabled: boolean; desktopEnabled: boolean };
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
   const save = (emailEnabled: boolean, desktopEnabled: boolean) =>
      gate.current.run(async () => {
         if (!workspace || !state) return;
         setSaving(true);
         setError(undefined);
         setState({ ...state, emailEnabled, desktopEnabled });
         try {
            if (desktopEnabled) {
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
                     body: JSON.stringify({ emailEnabled, desktopEnabled }),
                  }
               )
            );
            setState({ ...state, emailEnabled, desktopEnabled });
         } catch (reason) {
            setState(state);
            setError(
               reason instanceof Error ? reason.message : 'Could not save notification settings.'
            );
         } finally {
            setSaving(false);
         }
      });
   return (
      <DesignSurface>
         <SettingsShell
            title="Notifications"
            description="Choose how Flowie delivers notifications to you"
         >
            <VStack as="main" gap={4} width="100%">
               {!state && !error && <Text role="status">Loading notification settings…</Text>}
               {error && <Text role="alert">{error}</Text>}
               <Button label="Refresh delivery status" onClick={() => setReload((n) => n + 1)} />
               {state && (
                  <>
                     <CheckboxInput
                        label="Email notifications"
                        value={state.emailEnabled}
                        isDisabled={!state.emailAvailable || saving}
                        onChange={(checked) => {
                           void save(checked, state.desktopEnabled);
                        }}
                     />
                     <Text>
                        {state.emailAvailable
                           ? 'Email is delivered privately with retries.'
                           : 'Private SMTP delivery is not configured.'}
                     </Text>
                     <CheckboxInput
                        label="Desktop notifications"
                        value={state.desktopEnabled}
                        isDisabled={saving}
                        onChange={(checked) => {
                           void save(state.emailEnabled, checked);
                        }}
                     />
                     <Text>
                        Desktop alerts require permission on each browser and appear while Flowie is
                        in the background. Notification contents are kept private.
                     </Text>
                  </>
               )}
               {saving && <Text role="status">Saving…</Text>}
               <Heading level={2}>Email delivery</Heading>
               <Text>
                  Up to 50 recent delivery records. Transient failures retry; delivery can be at
                  least once.
               </Text>
               {deliveries.length === 0 && <Text>No email delivery records.</Text>}
               {deliveries.map((item) => (
                  <VStack key={item.notificationId} gap={1}>
                     <Text>
                        {item.deliveredAt ? 'Delivered' : item.failedAt ? 'Stopped' : 'Pending'} ·
                        attempts {item.attempts}
                     </Text>
                     {item.lastErrorCode && <Text type="supporting">{item.lastErrorCode}</Text>}
                  </VStack>
               ))}
               <Text>
                  Discord and Microsoft Teams are configured in workspace Integrations; Teams is
                  available when Microsoft sign-in is enabled. Native mobile and Slack delivery
                  require separate integrations.
               </Text>
            </VStack>
         </SettingsShell>
      </DesignSurface>
   );
}
