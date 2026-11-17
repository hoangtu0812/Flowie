'use client';

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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authenticatedFetch } from '@/lib/workspaces';
import { useIssuesStore } from '@/store/issues-store';
import type { SubProjectLabel } from '@/types/labels';
import { Archive, ArchiveRestore, Trash2 } from 'lucide-react';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useLiveProjectData } from './use-live-project';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
const DEFAULT_COLOR = '#6b7280';

async function request<T>(url: string, init: RequestInit, failure: string): Promise<T> {
   const response = await authenticatedFetch(url, {
      ...init,
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
   });
   if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { message?: string } | null;
      throw new Error(body?.message ?? failure);
   }
   return ((await response.json()) as { data: T }).data;
}

/**
 * Sub projects of the open project, inside Project settings: add (name + colour), rename or
 * recolour on blur, archive/restore, delete after confirmation. Each change saves at once; the
 * API applies the project's write permission and refuses names already used in the project. The
 * issues store gets the new list too, so pickers and filters show it without a reload.
 * VI: Sub project của dự án đang mở, trong Project settings: thêm (tên + màu), đổi tên hoặc màu
 * VI: khi rời ô, lưu trữ/khôi phục, xoá sau khi xác nhận. Mỗi thay đổi lưu ngay; API áp quyền ghi
 * VI: của dự án và từ chối tên đã dùng trong dự án. Issues store cũng nhận danh sách mới để picker
 * VI: và bộ lọc hiện ngay không cần tải lại.
 */
export function ProjectSubProjects() {
   const { project, workspaceId } = useLiveProjectData();
   const [items, setItems] = useState<SubProjectLabel[]>([]);
   const [name, setName] = useState('');
   const [color, setColor] = useState(DEFAULT_COLOR);
   const [pendingDelete, setPendingDelete] = useState<SubProjectLabel>();
   const base = project ? `${api}/projects/${project.id}/sub-project-labels` : '';
   const query = workspaceId ? `?${new URLSearchParams({ workspaceId })}` : '';

   const publish = useCallback(
      (next: SubProjectLabel[]) => {
         setItems(next);
         useIssuesStore.setState((state) => ({
            subProjectLabels: [
               ...state.subProjectLabels.filter((label) => label.projectId !== project?.id),
               ...next,
            ],
         }));
      },
      [project?.id]
   );

   useEffect(() => {
      if (!base || !query) return;
      request<SubProjectLabel[]>(`${base}${query}`, {}, 'Could not load sub projects.')
         .then(setItems)
         .catch((caught: Error) => toast.error(caught.message));
   }, [base, query]);

   const run = async (work: () => Promise<SubProjectLabel[]>) => {
      try {
         publish(await work());
         return true;
      } catch (caught) {
         toast.error(caught instanceof Error ? caught.message : 'Could not save the sub project.');
         return false;
      }
   };

   const add = async (event: FormEvent) => {
      event.preventDefault();
      if (!name.trim()) return;
      const saved = await run(async () => {
         const created = await request<SubProjectLabel>(
            base,
            { method: 'POST', body: JSON.stringify({ workspaceId, name: name.trim(), color }) },
            'Could not add the sub project.'
         );
         return [...items, created].sort((a, b) =>
            a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
         );
      });
      if (saved) setName('');
   };

   const update = (label: SubProjectLabel, changes: Record<string, unknown>) =>
      run(async () => {
         const updated = await request<SubProjectLabel>(
            `${base}/${label.id}${query}`,
            { method: 'PATCH', body: JSON.stringify(changes) },
            'Could not update the sub project.'
         );
         return items.map((item) => (item.id === updated.id ? updated : item));
      });

   const remove = (label: SubProjectLabel) =>
      run(async () => {
         await request(
            `${base}/${label.id}${query}`,
            { method: 'DELETE' },
            'Could not delete the sub project.'
         );
         return items.filter((item) => item.id !== label.id);
      });

   return (
      <div className="grid gap-2">
         <Label>Sub projects</Label>
         <p className="text-xs text-muted-foreground">
            Split this project&apos;s issues by area. Only issues of this project can use them;
            archived ones stay on their issues but cannot be picked again.
         </p>
         <ul className="grid gap-1.5" aria-label="Sub projects">
            {items.map((label) => (
               <li key={label.id} className="flex items-center gap-1.5">
                  <input
                     type="color"
                     aria-label={`Colour of ${label.name}`}
                     defaultValue={label.color}
                     className="size-7 shrink-0 cursor-pointer rounded border bg-transparent p-0.5"
                     onBlur={(event) =>
                        event.target.value !== label.color &&
                        void update(label, { color: event.target.value })
                     }
                  />
                  <Input
                     aria-label={`Rename ${label.name}`}
                     defaultValue={label.name}
                     maxLength={60}
                     className={label.archivedAt ? 'h-8 text-muted-foreground' : 'h-8'}
                     onBlur={(event) => {
                        const next = event.target.value.trim();
                        const input = event.target;
                        if (!next || next === label.name) {
                           input.value = label.name;
                           return;
                        }
                        void update(label, { name: next }).then((saved) => {
                           if (!saved) input.value = label.name;
                        });
                     }}
                  />
                  {label.archivedAt && (
                     <span className="shrink-0 text-xs text-muted-foreground">Archived</span>
                  )}
                  <Button
                     type="button"
                     variant="ghost"
                     size="icon"
                     className="size-8 shrink-0"
                     aria-label={
                        label.archivedAt ? `Restore ${label.name}` : `Archive ${label.name}`
                     }
                     title={label.archivedAt ? 'Restore' : 'Archive'}
                     onClick={() => void update(label, { archived: !label.archivedAt })}
                  >
                     {label.archivedAt ? (
                        <ArchiveRestore className="size-4" />
                     ) : (
                        <Archive className="size-4" />
                     )}
                  </Button>
                  <Button
                     type="button"
                     variant="ghost"
                     size="icon"
                     className="size-8 shrink-0"
                     aria-label={`Delete ${label.name}`}
                     title="Delete"
                     onClick={() => setPendingDelete(label)}
                  >
                     <Trash2 className="size-4" />
                  </Button>
               </li>
            ))}
         </ul>
         <form onSubmit={(event) => void add(event)} className="flex items-center gap-1.5">
            <input
               type="color"
               aria-label="Colour of the new sub project"
               value={color}
               onChange={(event) => setColor(event.target.value)}
               className="size-7 shrink-0 cursor-pointer rounded border bg-transparent p-0.5"
            />
            <Input
               aria-label="New sub project"
               placeholder="New sub project"
               value={name}
               maxLength={60}
               className="h-8"
               onChange={(event) => setName(event.target.value)}
            />
            <Button type="submit" size="sm" variant="outline" disabled={!name.trim()}>
               Add
            </Button>
         </form>
         <AlertDialog
            open={Boolean(pendingDelete)}
            onOpenChange={(open) => !open && setPendingDelete(undefined)}
         >
            <AlertDialogContent>
               <AlertDialogHeader>
                  <AlertDialogTitle>
                     Delete sub project &quot;{pendingDelete?.name}&quot;?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                     It is removed from every issue that has it. This cannot be undone; archive it
                     instead to keep it on existing issues.
                  </AlertDialogDescription>
               </AlertDialogHeader>
               <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                     variant="destructive"
                     onClick={() => pendingDelete && void remove(pendingDelete)}
                  >
                     Delete
                  </AlertDialogAction>
               </AlertDialogFooter>
            </AlertDialogContent>
         </AlertDialog>
      </div>
   );
}
