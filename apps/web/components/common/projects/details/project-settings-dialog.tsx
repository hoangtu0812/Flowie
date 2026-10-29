'use client';

import { IconPicker } from '@/components/common/icon-picker';
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
import { Label } from '@/components/ui/label';
import { type FormEvent, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useLiveProjectData } from './use-live-project';

/** Same rule as the API: 2–120 characters after trimming. VI: Cùng quy tắc với API: 2–120 ký tự sau khi bỏ khoảng trắng. */
export const projectNameError = (name: string) =>
   name.trim().length < 2 ? 'Project name must have at least 2 characters.' : undefined;

/**
 * Edits the project name and icon in one place. Saving goes through the shared live project
 * context, so the header, Overview and the other tabs show the new values at once; the API
 * enforces the same permission checks as every other project property.
 * VI: Sửa tên và icon dự án tại một chỗ. Lưu qua context dự án dùng chung nên header, Overview
 * và các tab khác hiển thị giá trị mới ngay; API áp dụng cùng kiểm tra quyền như các thuộc
 * tính dự án khác.
 */
export function ProjectSettingsDialog({
   open,
   onOpenChange,
}: {
   open: boolean;
   onOpenChange: (open: boolean) => void;
}) {
   const { project, updateProject } = useLiveProjectData();
   const [name, setName] = useState('');
   const [icon, setIcon] = useState('');
   const [saving, setSaving] = useState(false);

   useEffect(() => {
      if (!open || !project) return;
      setName(project.name);
      setIcon(project.icon ?? '');
   }, [open, project]);

   const error = projectNameError(name);

   const submit = async (event: FormEvent) => {
      event.preventDefault();
      if (error || saving) return;
      setSaving(true);
      try {
         await updateProject({ name: name.trim(), icon: icon.trim() || null });
         toast.success('Project updated.');
         onOpenChange(false);
      } catch (caught) {
         toast.error(caught instanceof Error ? caught.message : 'Could not update the project.');
      } finally {
         setSaving(false);
      }
   };

   return (
      <Dialog open={open} onOpenChange={onOpenChange}>
         <DialogContent className="sm:max-w-md">
            <form onSubmit={(event) => void submit(event)} className="grid gap-4">
               <DialogHeader>
                  <DialogTitle>Project settings</DialogTitle>
                  <DialogDescription>
                     Rename the project or change the icon shown next to its name.
                  </DialogDescription>
               </DialogHeader>
               <div className="grid gap-2">
                  <Label htmlFor="project-settings-name">Name</Label>
                  <Input
                     id="project-settings-name"
                     value={name}
                     maxLength={120}
                     onChange={(event) => setName(event.target.value)}
                     aria-invalid={Boolean(error)}
                     autoFocus
                  />
                  {error && <p className="text-xs text-destructive">{error}</p>}
               </div>
               <div className="grid gap-2">
                  <Label htmlFor="project-settings-icon">Icon</Label>
                  <div className="flex gap-2">
                     <Input
                        id="project-settings-icon"
                        value={icon}
                        maxLength={16}
                        placeholder="Default folder icon"
                        onChange={(event) => setIcon(event.target.value)}
                     />
                     <IconPicker value={icon} onChange={setIcon} label="Choose project icon" />
                  </div>
                  <p className="text-xs text-muted-foreground">
                     Use an emoji or a short symbol. Leave empty for the default icon.
                  </p>
               </div>
               <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                     Cancel
                  </Button>
                  <Button type="submit" disabled={Boolean(error) || saving}>
                     {saving ? 'Saving…' : 'Save'}
                  </Button>
               </DialogFooter>
            </form>
         </DialogContent>
      </Dialog>
   );
}
