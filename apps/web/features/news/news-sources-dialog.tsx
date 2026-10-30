'use client';
import { useState, type FormEvent } from 'react';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
   Dialog,
   DialogContent,
   DialogDescription,
   DialogHeader,
   DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useDateFormatter } from '@/features/shared/account-time';
import { useMessages } from '@/features/shared/use-messages';
import { messages } from './messages.vi';
import { newsRequest, type NewsCategory, type NewsData } from './types';

/**
 * Owner/admin editor for news groups (name + optional Teams Workflows webhook) and their RSS/Atom
 * sources. The API enforces the feed host allowlist and webhook format; its error message is
 * shown as a toast. Every successful change calls `onChanged` to reload the whole page.
 * VI: Trình chỉnh sửa cho owner/admin: nhóm tin (tên + webhook Teams Workflows tuỳ chọn) và các
 * VI: nguồn RSS/Atom. API kiểm tra allowlist host feed và định dạng webhook; thông báo lỗi của API
 * VI: hiển thị bằng toast. Mỗi thay đổi thành công gọi `onChanged` để tải lại cả trang.
 */
export function NewsSourcesDialog({
   open,
   onOpenChange,
   workspaceId,
   data,
   onChanged,
}: {
   open: boolean;
   onOpenChange: (open: boolean) => void;
   workspaceId: string;
   data: NewsData;
   onChanged: () => Promise<void>;
}) {
   const tx = useMessages(messages);
   const [busy, setBusy] = useState(false);
   const [groupName, setGroupName] = useState('');

   const run = async (path: string, method: string, body?: unknown) => {
      setBusy(true);
      try {
         await newsRequest(workspaceId, path, method, body);
         await onChanged();
         return true;
      } catch (reason) {
         toast.error(reason instanceof Error ? reason.message : String(reason));
         return false;
      } finally {
         setBusy(false);
      }
   };

   const addGroup = async (event: FormEvent) => {
      event.preventDefault();
      if (await run('/categories', 'POST', { name: groupName })) setGroupName('');
   };

   return (
      <Dialog open={open} onOpenChange={onOpenChange}>
         <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
               <DialogTitle>{tx('News groups and sources')}</DialogTitle>
               <DialogDescription>
                  {tx(
                     'Each group can post new items to its own Microsoft Teams channel (Teams Workflows webhook).'
                  )}
               </DialogDescription>
            </DialogHeader>
            {data.categories.map((category) => (
               <CategoryEditor
                  key={category.id}
                  workspaceId={workspaceId}
                  category={category}
                  data={data}
                  busy={busy}
                  run={run}
               />
            ))}
            <form onSubmit={addGroup} className="flex gap-2">
               <Input
                  aria-label={tx('Group name')}
                  placeholder={tx('Group name')}
                  value={groupName}
                  maxLength={60}
                  onChange={(event) => setGroupName(event.target.value)}
               />
               <Button type="submit" disabled={busy || !groupName.trim()}>
                  {tx('Add group')}
               </Button>
            </form>
         </DialogContent>
      </Dialog>
   );
}

function CategoryEditor({
   workspaceId,
   category,
   data,
   busy,
   run,
}: {
   workspaceId: string;
   category: NewsCategory;
   data: NewsData;
   busy: boolean;
   run: (path: string, method: string, body?: unknown) => Promise<boolean>;
}) {
   const tx = useMessages(messages);
   const dateLabel = useDateFormatter();
   const [webhook, setWebhook] = useState('');
   const [testing, setTesting] = useState(false);
   const [sourceName, setSourceName] = useState('');
   const [feedUrl, setFeedUrl] = useState('');
   const sources = (data.sources ?? []).filter((source) => source.categoryId === category.id);

   const addSource = async (event: FormEvent) => {
      event.preventDefault();
      if (await run('/sources', 'POST', { categoryId: category.id, name: sourceName, feedUrl })) {
         setSourceName('');
         setFeedUrl('');
      }
   };

   return (
      <section aria-label={category.name} className="flex flex-col gap-2 rounded-md border p-3">
         <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{category.name}</span>
            <span className="text-xs text-muted-foreground font-mono truncate">
               {category.webhookUrlMasked ?? tx('No Teams channel')}
            </span>
            <Button
               size="icon"
               variant="ghost"
               className="ml-auto size-7"
               aria-label={tx('Delete group')}
               disabled={busy}
               onClick={() => {
                  if (window.confirm(tx('Delete this group with its sources and news?')))
                     void run(`/categories/${category.id}`, 'DELETE');
               }}
            >
               <Trash2 className="size-3.5" />
            </Button>
         </div>
         <div className="flex gap-2">
            <Input
               aria-label={tx('Teams webhook URL')}
               placeholder={tx('Teams webhook URL')}
               value={webhook}
               onChange={(event) => setWebhook(event.target.value)}
            />
            <Button
               variant="outline"
               disabled={busy || !webhook.trim()}
               onClick={async () => {
                  if (await run(`/categories/${category.id}`, 'PATCH', { webhookUrl: webhook }))
                     setWebhook('');
               }}
            >
               {tx('Save webhook')}
            </Button>
            {category.webhookUrlMasked && (
               <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() =>
                     void run(`/categories/${category.id}`, 'PATCH', { webhookUrl: '' })
                  }
               >
                  {tx('Remove webhook')}
               </Button>
            )}
            {category.webhookUrlMasked && (
               <Button
                  variant="ghost"
                  disabled={busy || testing}
                  onClick={async () => {
                     // The API posts a test card to the stored webhook and reports Teams' answer.
                     // VI: API gửi thẻ thử tới webhook đã lưu và trả về phản hồi của Teams.
                     setTesting(true);
                     try {
                        const result = await newsRequest<{ delivered: boolean; reason?: string }>(
                           workspaceId,
                           `/categories/${category.id}/test`,
                           'POST'
                        );
                        if (result.delivered)
                           toast.success(tx('Test card sent to Microsoft Teams.'));
                        else
                           toast.error(
                              result.reason ?? tx('Microsoft Teams did not accept the test card.')
                           );
                     } catch (reason) {
                        toast.error(reason instanceof Error ? reason.message : String(reason));
                     } finally {
                        setTesting(false);
                     }
                  }}
               >
                  {tx('Test webhook')}
               </Button>
            )}
         </div>
         <ul className="flex flex-col">
            {sources.map((source) => (
               <li
                  key={source.id}
                  className="flex items-center gap-2 py-1.5 border-t border-border/50"
               >
                  <Switch
                     aria-label={`${tx('Enabled')}: ${source.name}`}
                     checked={source.enabled}
                     disabled={busy}
                     onCheckedChange={(enabled) =>
                        void run(`/sources/${source.id}`, 'PATCH', { enabled })
                     }
                  />
                  <span className="flex flex-col min-w-0 flex-1">
                     <span className="text-sm truncate">{source.name}</span>
                     <span className="text-xs text-muted-foreground truncate">
                        {source.feedUrl}
                     </span>
                     <span
                        className={
                           source.lastError
                              ? 'text-xs text-destructive'
                              : 'text-xs text-muted-foreground'
                        }
                     >
                        {source.lastError ??
                           (source.lastFetchedAt
                              ? tx('Last fetched {date}', { date: dateLabel(source.lastFetchedAt) })
                              : tx('Not fetched yet'))}
                     </span>
                  </span>
                  <Button
                     size="icon"
                     variant="ghost"
                     className="size-7"
                     aria-label={`${tx('Delete source')}: ${source.name}`}
                     disabled={busy}
                     onClick={() => void run(`/sources/${source.id}`, 'DELETE')}
                  >
                     <Trash2 className="size-3.5" />
                  </Button>
               </li>
            ))}
         </ul>
         <form onSubmit={addSource} className="flex gap-2">
            <Input
               aria-label={tx('Source name')}
               placeholder={tx('Source name')}
               value={sourceName}
               maxLength={100}
               onChange={(event) => setSourceName(event.target.value)}
               className="w-40"
            />
            <Input
               aria-label={tx('Feed URL (RSS/Atom)')}
               placeholder="https://www.bleepingcomputer.com/feed/"
               value={feedUrl}
               onChange={(event) => setFeedUrl(event.target.value)}
            />
            <Button type="submit" disabled={busy || !sourceName.trim() || !feedUrl.trim()}>
               {tx('Add source')}
            </Button>
         </form>
      </section>
   );
}
