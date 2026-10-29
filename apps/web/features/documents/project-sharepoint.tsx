'use client';

import { type FormEvent, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
   Dialog,
   DialogContent,
   DialogDescription,
   DialogFooter,
   DialogHeader,
   DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
   loadProjectSharepoint,
   saveProjectSharepoint,
   testSharepointFolder,
} from '@/components/settings/sharepoint-integration';
import { useMessages } from '@/features/shared/use-messages';
import { messages } from '@/features/documents/messages.vi';

/**
 * SharePoint folder of a project. Approved documents of the project's Docs tree are
 * published there as `<module>/<feature>/<title>.md`. Test signs in with the workspace
 * connection and resolves the folder without uploading; saving an empty URL stops
 * publishing for the project. Only workspace administrators can test or save.
 * VI: Thư mục SharePoint của dự án. Tài liệu đã duyệt trong cây Docs của dự án được phát hành
 * VI: vào đó thành `<module>/<tính năng>/<tiêu đề>.md`. Nút Kiểm tra đăng nhập bằng kết nối
 * VI: của workspace và phân giải thư mục mà không tải file; lưu URL trống sẽ ngừng phát hành
 * VI: cho dự án. Chỉ quản trị viên workspace được kiểm tra hoặc lưu.
 */
export function ProjectSharepointDialog({
   projectId,
   onClose,
}: {
   projectId: string;
   onClose: () => void;
}) {
   const tx = useMessages(messages);
   const [url, setUrl] = useState('');
   const [connection, setConnection] = useState<boolean>();
   const [busy, setBusy] = useState(false);

   useEffect(() => {
      void loadProjectSharepoint(projectId)
         .then((value) => {
            setUrl(value.folderUrl ?? '');
            setConnection(value.connectionEnabled);
         })
         .catch(() => setConnection(false));
   }, [projectId]);

   async function run(operation: () => Promise<string>) {
      setBusy(true);
      try {
         toast.success(await operation());
      } catch (error) {
         toast.error(error instanceof Error ? error.message : tx('Could not save.'));
      } finally {
         setBusy(false);
      }
   }

   function save(event: FormEvent) {
      event.preventDefault();
      void run(async () => {
         await saveProjectSharepoint(projectId, url.trim() || null);
         onClose();
         return tx('SharePoint folder saved.');
      });
   }

   return (
      <Dialog open onOpenChange={(next) => !next && onClose()}>
         <DialogContent className="sm:max-w-lg">
            <DialogHeader>
               <DialogTitle>{tx('Publish to SharePoint')}</DialogTitle>
               <DialogDescription>
                  {tx(
                     'Approved documents are published to this folder as Markdown, keeping the module/feature folders.'
                  )}
               </DialogDescription>
            </DialogHeader>
            <form className="grid gap-3" onSubmit={save}>
               <Input
                  autoFocus
                  type="url"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="https://<tenant>.sharepoint.com/sites/<site>/Shared Documents/<folder>"
                  aria-label={tx('SharePoint folder URL')}
               />
               <p className="text-xs text-muted-foreground">
                  {tx('Open the folder in SharePoint and copy the address bar.')}
               </p>
               {connection === false && (
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                     {tx(
                        'The workspace SharePoint connection is not set up or is paused (Settings → Integrations).'
                     )}
                  </p>
               )}
               <DialogFooter>
                  <Button
                     type="button"
                     variant="outline"
                     disabled={busy || !url.trim()}
                     onClick={() =>
                        void run(async () => {
                           const target = await testSharepointFolder(url.trim());
                           return tx('Found {value0} / {value1}.', {
                              value0: target.library,
                              value1: target.folderPath || '/',
                           });
                        })
                     }
                  >
                     {tx('Test')}
                  </Button>
                  <Button type="submit" disabled={busy}>
                     {tx('Save')}
                  </Button>
               </DialogFooter>
            </form>
         </DialogContent>
      </Dialog>
   );
}
