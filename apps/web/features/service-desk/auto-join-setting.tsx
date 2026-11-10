'use client';

import { useEffect, useState } from 'react';
import {
   AlertDialog,
   AlertDialogAction,
   AlertDialogCancel,
   AlertDialogContent,
   AlertDialogDescription,
   AlertDialogFooter,
   AlertDialogHeader,
   AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { SettingsCard, SettingsSection } from '@/features/settings/shared';
import { useMessages } from '@/features/shared/use-messages';
import { messages } from './messages.vi';
import { loadAutoJoin, saveAutoJoin, type AutoJoin } from './service-desk-api';

/**
 * The workspace switch that lets company accounts join on Microsoft sign-in. It stays hidden on a
 * server without Microsoft sign-in, or if the status cannot be read. Turning it on opens the
 * workspace to every employee, so it first asks for confirmation and shows how much data with no
 * team they would read. Turning it off needs no confirmation and removes nobody.
 * VI: Công tắc workspace cho tài khoản công ty tự vào khi đăng nhập Microsoft. Công tắc ẩn trên
 * VI: server không có đăng nhập Microsoft, hoặc khi không đọc được trạng thái. Bật sẽ mở workspace
 * VI: cho mọi nhân viên, nên phải xác nhận trước và hiện lượng dữ liệu không gắn team họ sẽ đọc được.
 * VI: Tắt thì không cần xác nhận và không xoá ai.
 */
export function AutoJoinSetting({ workspaceId }: { workspaceId: string }) {
   const tx = useMessages(messages);
   const [status, setStatus] = useState<AutoJoin>();
   const [confirming, setConfirming] = useState(false);
   const [saving, setSaving] = useState(false);
   const [error, setError] = useState<string>();

   useEffect(() => {
      let current = true;
      loadAutoJoin(workspaceId)
         .then((loaded) => current && setStatus(loaded))
         .catch(() => undefined);
      return () => {
         current = false;
      };
   }, [workspaceId]);

   if (!status?.available) return null;

   const change = async (enabled: boolean) => {
      setSaving(true);
      setError(undefined);
      try {
         await saveAutoJoin(workspaceId, enabled);
         setStatus({ ...status, enabled });
      } catch (caught) {
         setError(caught instanceof Error ? caught.message : 'Could not save this setting.');
      } finally {
         setSaving(false);
         setConfirming(false);
      }
   };

   return (
      <SettingsSection title={tx('Company access')}>
         <SettingsCard>
            <div className="flex items-center justify-between gap-4 p-4">
               <div className="grid gap-1">
                  <Label htmlFor="workspace-auto-join">
                     {tx('Let company accounts join automatically')}
                  </Label>
                  <p className="text-sm text-muted-foreground">
                     {tx(
                        'Staff who sign in with Microsoft join as members of no team. They can raise tickets and read anything in this workspace that has no team.'
                     )}
                  </p>
                  {error && (
                     <p role="alert" className="text-sm text-destructive">
                        {error}
                     </p>
                  )}
               </div>
               <Switch
                  id="workspace-auto-join"
                  checked={status.enabled}
                  disabled={saving}
                  onCheckedChange={(checked) =>
                     checked ? setConfirming(true) : void change(false)
                  }
               />
            </div>
         </SettingsCard>
         <AlertDialog open={confirming} onOpenChange={setConfirming}>
            <AlertDialogContent>
               <AlertDialogHeader>
                  <AlertDialogTitle>{tx('Turn on automatic joining?')}</AlertDialogTitle>
                  <AlertDialogDescription>
                     {tx('Everyone in the company will be able to read:')}
                  </AlertDialogDescription>
               </AlertDialogHeader>
               <ul className="list-disc pl-5 text-sm">
                  <li>{tx('{count} projects with no team', { count: status.teamlessProjects })}</li>
                  <li>{tx('{count} issues with no team', { count: status.teamlessIssues })}</li>
                  <li>
                     {tx('{count} documents with no team', { count: status.teamlessDocuments })}
                  </li>
               </ul>
               <p className="text-sm text-muted-foreground">
                  {tx(
                     'Move sensitive work into a team before you continue. People who were removed or left stay out unless you invite them again. Turning this off later does not remove anyone.'
                  )}
               </p>
               <AlertDialogFooter>
                  <AlertDialogCancel disabled={saving}>{tx('Cancel')}</AlertDialogCancel>
                  <AlertDialogAction
                     disabled={saving}
                     onClick={(event) => {
                        event.preventDefault();
                        void change(true);
                     }}
                  >
                     {tx('Turn on')}
                  </AlertDialogAction>
               </AlertDialogFooter>
            </AlertDialogContent>
         </AlertDialog>
      </SettingsSection>
   );
}
