'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Copy, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@astryxdesign/core/Button';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { HStack, Layout, LayoutContent, LayoutFooter, VStack } from '@astryxdesign/core/Layout';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { Table, pixel, proportional, type TableColumn } from '@astryxdesign/core/Table';
import { Heading, Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
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
import { SettingsShell } from '@/features/settings/shared';
import { useMessages } from '@/features/shared/use-messages';
import { useUiPreferencesStore } from '@/store/ui-preferences-store';
import { api, type ApiKey } from '@/lib/api-keys';
import { relativeTime } from '@/lib/time';
import { isInactive, useApiKeys } from './use-api-keys';
import { messages } from './messages.vi';

const SCOPE_LABELS: Record<string, string> = { 'news:read': 'Read news (news feed)' };

/**
 * Settings → API keys: the workspace's keys for other systems, New API key (the token is shown
 * once), revoke, and delete once revoked or expired. Owners and admins only.
 * VI: Settings → API keys: các key của workspace cho hệ thống khác, New API key (token hiện một
 * VI: lần), thu hồi, và xoá khi đã thu hồi hoặc hết hạn. Chỉ owner và admin.
 */
export function ApiKeysSettings() {
   const tx = useMessages(messages);
   const locale = useUiPreferencesStore((state) => state.locale);
   const state = useApiKeys();
   const [creating, setCreating] = useState(false);
   const [name, setName] = useState('');
   const [expires, setExpires] = useState('90');
   const [scopes, setScopes] = useState<string[]>(['news:read']);
   /** The key the confirmation dialog revokes (active) or deletes for good (inactive). */
   /** VI: Key mà hộp thoại xác nhận sẽ thu hồi (đang hoạt động) hoặc xoá hẳn (không hoạt động). */
   const [target, setTarget] = useState<ApiKey>();
   const validExpiry =
      Number.isInteger(Number(expires)) && Number(expires) >= 1 && Number(expires) <= 365;
   const targetInactive = target ? isInactive(target) : false;

   function closeForm() {
      setCreating(false);
      setName('');
      setExpires('90');
      setScopes(['news:read']);
   }

   async function copy(value: string) {
      try {
         await navigator.clipboard.writeText(value);
         toast.success(tx('Copied.'));
      } catch {
         toast.error(tx('Clipboard unavailable; copy the value manually.'));
      }
   }

   const columns: TableColumn<ApiKey>[] = [
      {
         key: 'name',
         header: tx('Name'),
         width: proportional(2),
         renderCell: (key) => (
            <HStack gap={2} vAlign="center">
               <StatusDot
                  variant={isInactive(key) ? 'neutral' : 'success'}
                  label={isInactive(key) ? tx('Inactive') : tx('Active')}
               />
               <Text className="truncate">{key.name}</Text>
            </HStack>
         ),
      },
      {
         key: 'prefix',
         header: tx('Key'),
         width: pixel(170),
         renderCell: (key) => `${key.prefix}…`,
      },
      {
         key: 'expiresAt',
         header: tx('Expires'),
         width: proportional(1),
         renderCell: (key) => (key.revokedAt ? tx('Revoked') : key.expiresAt.slice(0, 10)),
      },
      {
         key: 'lastUsedAt',
         header: tx('Last used'),
         width: proportional(1),
         renderCell: (key) =>
            key.lastUsedAt ? relativeTime(key.lastUsedAt, Date.now(), locale) : tx('Never'),
      },
      {
         key: 'createdBy',
         header: tx('Created by'),
         width: proportional(1),
         renderCell: (key) => key.createdBy ?? '—',
      },
      {
         key: 'actions',
         header: <span className="sr-only">{tx('Actions')}</span>,
         width: pixel(64),
         align: 'end',
         renderCell: (key) => (
            <Button
               label={isInactive(key) ? tx('Delete API key') : tx('Revoke API key')}
               tooltip={isInactive(key) ? tx('Delete API key') : tx('Revoke API key')}
               icon={<Trash2 className="size-4" />}
               isIconOnly
               size="sm"
               variant="ghost"
               isDisabled={state.busy}
               onClick={() => setTarget(key)}
            />
         ),
      },
   ];

   return (
      <SettingsShell
         title={tx('API keys')}
         description={tx(
            'Keys let other systems call the Flowie API. They are separate from AI connections (MCP).'
         )}
      >
         <VStack gap={4}>
            {state.loading && <Text>{tx('Loading API keys…')}</Text>}
            {state.error && <Text role="alert">{state.error}</Text>}
            {!state.loading && !state.error && !state.canManage && (
               <Text color="secondary">
                  {tx('Only workspace owners and admins can manage API keys.')}
               </Text>
            )}
            {state.canManage && (
               <>
                  <HStack gap={2} vAlign="center" hAlign="between">
                     <Heading level={3}>
                        {tx('Keys ({count})', { count: state.keys.length })}
                     </Heading>
                     <Button
                        label={tx('New API key')}
                        size="sm"
                        variant="primary"
                        icon={<Plus className="size-4" />}
                        onClick={() => setCreating(true)}
                     />
                  </HStack>
                  {state.keys.length ? (
                     <VStack className="relative w-full min-w-0 overflow-x-auto">
                        <Table
                           data={state.keys}
                           columns={columns}
                           idKey="id"
                           density="compact"
                           hasHover
                           textOverflow="truncate"
                        />
                     </VStack>
                  ) : (
                     !state.loading && (
                        <Text color="secondary">{tx('No API keys have been created.')}</Text>
                     )
                  )}
                  <AnimatePresence>
                     {state.token && (
                        <motion.div
                           initial={{ opacity: 0, y: -8 }}
                           animate={{ opacity: 1, y: 0 }}
                           exit={{ opacity: 0, y: -8 }}
                        >
                           <VStack gap={2}>
                              <Text>
                                 {tx('Copy this key into the other system. It is shown once.')}
                              </Text>
                              <HStack gap={2} vAlign="end">
                                 <TextInput
                                    label={tx('API key')}
                                    value={state.token}
                                    isReadOnly
                                    width="100%"
                                 />
                                 <Button
                                    label={tx('Copy API key')}
                                    tooltip={tx('Copy API key')}
                                    icon={<Copy className="size-4" />}
                                    isIconOnly
                                    clickAction={() => copy(state.token ?? '')}
                                 />
                                 <Button
                                    label={tx('Dismiss')}
                                    tooltip={tx('Dismiss')}
                                    icon={<X className="size-4" />}
                                    isIconOnly
                                    variant="ghost"
                                    onClick={state.dismissToken}
                                 />
                              </HStack>
                           </VStack>
                        </motion.div>
                     )}
                  </AnimatePresence>
                  <Heading level={4}>{tx('Read the news feed')}</Heading>
                  <Text type="supporting" color="secondary">
                     {tx(
                        'Send the key as a Bearer token. See docs/api-keys.md for the parameters.'
                     )}
                  </Text>
                  <pre className="overflow-x-auto rounded-md border bg-container p-3 text-xs">
                     {`curl -H "Authorization: Bearer $FLOWIE_API_KEY" \\\n  "${api}/news/feed?limit=50"`}
                  </pre>
               </>
            )}
            {creating && (
               <Dialog
                  isOpen
                  aria-label={tx('New API key')}
                  purpose="form"
                  width={560}
                  onOpenChange={(open) => {
                     if (!open && !state.busy) closeForm();
                  }}
               >
                  <Layout
                     height="auto"
                     padding={4}
                     header={
                        <DialogHeader
                           title={tx('New API key')}
                           onOpenChange={() => {
                              if (!state.busy) closeForm();
                           }}
                        />
                     }
                     footer={
                        <LayoutFooter>
                           <HStack gap={2} hAlign="end">
                              <Button label={tx('Cancel')} variant="ghost" onClick={closeForm} />
                              <Button
                                 label={tx('Create API key')}
                                 variant="primary"
                                 icon={<Plus className="size-4" />}
                                 isLoading={state.busy}
                                 isDisabled={
                                    name.trim().length < 2 || !validExpiry || !scopes.length
                                 }
                                 onClick={() =>
                                    void state
                                       .create({ name, scopes, expiresInDays: Number(expires) })
                                       .then((saved) => {
                                          if (saved) closeForm();
                                       })
                                 }
                              />
                           </HStack>
                        </LayoutFooter>
                     }
                  >
                     <LayoutContent>
                        <VStack gap={4}>
                           <HStack gap={3}>
                              <TextInput
                                 label={tx('Key name')}
                                 value={name}
                                 onChange={setName}
                                 isRequired
                                 width="100%"
                              />
                              <TextInput
                                 label={tx('Expires in days (1–365)')}
                                 value={expires}
                                 onChange={setExpires}
                              />
                           </HStack>
                           <VStack gap={1} role="group" aria-label={tx('Permissions')}>
                              <Heading level={4}>{tx('Permissions')}</Heading>
                              {state.scopes.map((scope) => (
                                 <CheckboxInput
                                    key={scope}
                                    label={SCOPE_LABELS[scope] ? tx(SCOPE_LABELS[scope]) : scope}
                                    value={scopes.includes(scope)}
                                    onChange={(checked) =>
                                       setScopes((current) =>
                                          checked
                                             ? [...current, scope]
                                             : current.filter((item) => item !== scope)
                                       )
                                    }
                                 />
                              ))}
                           </VStack>
                        </VStack>
                     </LayoutContent>
                  </Layout>
               </Dialog>
            )}
            <AlertDialog
               open={Boolean(target)}
               onOpenChange={(visible) => !visible && !state.busy && setTarget(undefined)}
            >
               <AlertDialogContent>
                  <AlertDialogHeader>
                     <AlertDialogTitle>
                        {targetInactive
                           ? tx('Delete {name}?', { name: target?.name ?? '' })
                           : tx('Revoke {name}?', { name: target?.name ?? '' })}
                     </AlertDialogTitle>
                     <AlertDialogDescription>
                        {targetInactive
                           ? tx('The key is removed from this list for good.')
                           : tx(
                                'Systems using this key lose access at once. This cannot be undone.'
                             )}
                     </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                     <AlertDialogCancel disabled={state.busy}>{tx('Cancel')}</AlertDialogCancel>
                     <AlertDialogAction
                        disabled={state.busy}
                        variant="destructive"
                        onClick={(event) => {
                           event.preventDefault();
                           if (!target) return;
                           void (targetInactive ? state.remove : state.revoke)(target.id).then(
                              (done) => {
                                 if (done) setTarget(undefined);
                              }
                           );
                        }}
                     >
                        {targetInactive ? tx('Delete API key') : tx('Revoke API key')}
                     </AlertDialogAction>
                  </AlertDialogFooter>
               </AlertDialogContent>
            </AlertDialog>
         </VStack>
      </SettingsShell>
   );
}
