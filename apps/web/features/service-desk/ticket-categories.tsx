'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SettingsCard, SettingsSection } from '@/features/settings/shared';
import { useMessages } from '@/features/shared/use-messages';
import { messages } from './messages.vi';
import {
   createTicketCategory,
   listTicketCategories,
   updateTicketCategory,
   type TicketCategory,
} from './service-desk-api';

/**
 * The workspace's live ticket categories; empty while loading or when the read fails, so the
 * ticket form then behaves as it did before categories.
 * VI: Các phân loại ticket còn hiệu lực của workspace; rỗng khi đang tải hoặc lỗi, để form ticket
 * VI: khi đó chạy như trước khi có phân loại.
 */
export function useTicketCategories(workspaceId: string | undefined) {
   const [categories, setCategories] = useState<TicketCategory[]>([]);
   useEffect(() => {
      setCategories([]);
      if (!workspaceId) return;
      let current = true;
      listTicketCategories(workspaceId).then(
         (loaded) => current && setCategories(loaded),
         () => undefined
      );
      return () => {
         current = false;
      };
   }, [workspaceId]);
   return categories;
}

/**
 * Workspace settings for ticket categories. Archiving instead of deleting keeps the name on
 * tickets that already use it.
 * VI: Cài đặt phân loại ticket của workspace. Lưu trữ thay vì xoá để giữ tên trên các ticket đã dùng.
 */
export function TicketCategorySettings({ workspaceId }: { workspaceId: string }) {
   const tx = useMessages(messages);
   const [categories, setCategories] = useState<TicketCategory[]>();
   const [name, setName] = useState('');
   const [busy, setBusy] = useState(false);
   const [error, setError] = useState<string>();

   const load = useCallback(
      () => listTicketCategories(workspaceId, true).then(setCategories),
      [workspaceId]
   );
   useEffect(() => {
      load().catch((caught: unknown) =>
         setError(caught instanceof Error ? caught.message : 'Could not load ticket categories.')
      );
   }, [load]);

   const run = async (action: () => Promise<unknown>) => {
      setBusy(true);
      setError(undefined);
      try {
         await action();
         await load();
         return true;
      } catch (caught) {
         setError(caught instanceof Error ? caught.message : 'Could not save this setting.');
         return false;
      } finally {
         setBusy(false);
      }
   };

   const add = async () => {
      if (await run(() => createTicketCategory(workspaceId, name.trim()))) setName('');
   };

   return (
      <SettingsSection title={tx('Ticket categories')}>
         <SettingsCard>
            <div className="grid gap-3 p-4">
               <p className="text-sm text-muted-foreground">
                  {tx(
                     'People raising a ticket must pick one of these. Archived categories stay on old tickets.'
                  )}
               </p>
               {categories?.map((category) => (
                  <div key={category.id} className="flex items-center gap-2 text-sm">
                     <span
                        className={
                           category.archived
                              ? 'flex-1 text-muted-foreground line-through'
                              : 'flex-1'
                        }
                     >
                        {category.name}
                     </span>
                     <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() =>
                           void run(() =>
                              updateTicketCategory(workspaceId, category.id, {
                                 archived: !category.archived,
                              })
                           )
                        }
                     >
                        {tx(category.archived ? 'Restore' : 'Archive')}
                     </Button>
                  </div>
               ))}
               <form
                  className="flex gap-2"
                  onSubmit={(event) => {
                     event.preventDefault();
                     if (name.trim()) void add();
                  }}
               >
                  <Input
                     value={name}
                     maxLength={80}
                     aria-label={tx('New category')}
                     placeholder={tx('New category, e.g. Hardware')}
                     onChange={(event) => setName(event.target.value)}
                  />
                  <Button type="submit" disabled={busy || !name.trim()}>
                     {tx('Add')}
                  </Button>
               </form>
               {error && (
                  <p role="alert" className="text-sm text-destructive">
                     {error}
                  </p>
               )}
            </div>
         </SettingsCard>
      </SettingsSection>
   );
}
