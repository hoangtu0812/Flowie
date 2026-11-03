'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@astryxdesign/core/Button';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { HStack, Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { toast } from 'sonner';
import { authenticatedFetch } from '@/lib/workspaces';
import { responseData, ApiRequestError } from '@/lib/http';
import { useMessages } from '@/features/shared/use-messages';
import type { LiveView } from '@/components/common/views/use-live-views';
import { ViewEditor } from './view-editor';
import { messages } from './messages.vi';

export function ViewActions({
   view,
   config,
   workspaceId,
   currentUserId,
   disabled = false,
   dirty = false,
}: {
   view: LiveView;
   config: Record<string, unknown>;
   workspaceId: string;
   currentUserId?: string;
   disabled?: boolean;
   dirty?: boolean;
}) {
   const tx = useMessages(messages);
   const router = useRouter();
   const { orgId } = useParams<{ orgId: string }>();
   const [dialog, setDialog] = useState<'edit' | 'new' | 'delete'>();
   const [busy, setBusy] = useState(false);
   const [error, setError] = useState<string>();
   const owner = view.createdBy.id === currentUserId;
   const remove = async () => {
      setBusy(true);
      setError(undefined);
      try {
         await responseData(
            await authenticatedFetch(
               `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1'}/views/${view.id}?${new URLSearchParams({ workspaceId, expectedUpdatedAt: view.updatedAt })}`,
               { method: 'DELETE' }
            )
         );
         window.dispatchEvent(new Event('flowie:views-changed'));
         toast.success(tx('View deleted.'));
         router.push(`/${orgId}/views`);
      } catch (caught) {
         setError(
            caught instanceof ApiRequestError && caught.status === 409
               ? tx('This view changed in another session. Reload before saving.')
               : caught instanceof Error
                 ? caught.message
                 : tx('Could not delete view.')
         );
      } finally {
         setBusy(false);
      }
   };
   return (
      <>
         <HStack gap={2} wrap="wrap">
            {view.entityType === 'issue' && (
               <>
                  <Button
                     label={tx('Save as new')}
                     size="sm"
                     isDisabled={disabled}
                     onClick={() => setDialog('new')}
                  />
                  {owner && (
                     <Button
                        label={tx(dirty ? 'Save changes' : 'Edit view')}
                        size="sm"
                        isDisabled={disabled}
                        onClick={() => setDialog('edit')}
                     />
                  )}
               </>
            )}
            {owner && (
               <Button
                  label={tx('Delete view')}
                  size="sm"
                  variant="ghost"
                  onClick={() => setDialog('delete')}
               />
            )}
         </HStack>
         {(dialog === 'edit' || dialog === 'new') && (
            <ViewEditor
               workspaceId={workspaceId}
               config={config}
               view={dialog === 'edit' ? view : undefined}
               onClose={() => setDialog(undefined)}
            />
         )}
         {dialog === 'delete' && (
            <Dialog
               isOpen
               aria-label={tx('Delete view')}
               purpose="form"
               onOpenChange={(open) => {
                  if (!open && !busy) setDialog(undefined);
               }}
            >
               <Layout
                  height="auto"
                  padding={4}
                  header={<DialogHeader title={tx('Delete view')} />}
                  footer={
                     <LayoutFooter>
                        <HStack gap={2} justify="end">
                           <Button
                              label={tx('Cancel')}
                              isDisabled={busy}
                              onClick={() => setDialog(undefined)}
                           />
                           {error && (
                              <Button
                                 label={tx('Reload view')}
                                 onClick={() => window.location.assign(window.location.pathname)}
                              />
                           )}
                           <Button
                              label={tx('Delete view')}
                              variant="destructive"
                              isLoading={busy}
                              onClick={() => void remove()}
                           />
                        </HStack>
                     </LayoutFooter>
                  }
               >
                  <LayoutContent>
                     <Text as="p">{tx('Delete this view? Issues and projects will be kept.')}</Text>
                     {error && <Text as="p">{error}</Text>}
                  </LayoutContent>
               </Layout>
            </Dialog>
         )}
      </>
   );
}
