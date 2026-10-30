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
import { usePathname, useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { canonicalProjectPath } from '@/lib/project-route';
import { rememberProjectSlug } from '../project-route';
import { useLiveProjectData } from './use-live-project';

/** Same rule as the API: 2–120 characters after trimming. VI: Cùng quy tắc với API: 2–120 ký tự sau khi bỏ khoảng trắng. */
export const projectNameError = (name: string) =>
   name.trim().length < 2 ? 'Project name must have at least 2 characters.' : undefined;

/**
 * Same rule as the API, checked as typed so the field explains a refusal before saving; the value
 * is never rewritten. VI: Cùng quy tắc với API, kiểm tra khi gõ để ô nhập giải thích lỗi trước khi
 * VI: lưu; giá trị không bao giờ bị tự sửa.
 */
export const projectSlugError = (slug: string) => {
   if (!slug) return 'Slug is required.';
   if (slug.length > 63) return 'Slug must have at most 63 characters.';
   if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))
      return 'Use only a-z, 0-9 and single hyphens, without a hyphen at the start or end.';
   if (/^c[a-z0-9]{24}$/.test(slug)) return 'This slug looks like a project id.';
   return undefined;
};

/**
 * Edits the project name, icon and URL slug in one place. Saving goes through the shared live
 * project context, so the header, Overview and the other tabs show the new values at once; the
 * API enforces the same permission checks as every other project property. A new slug moves the
 * current tab to the new address; the old slug stays an alias, so shared links keep working.
 * VI: Sửa tên, icon và slug URL của dự án tại một chỗ. Lưu qua context dự án dùng chung nên
 * VI: header, Overview và các tab khác hiển thị giá trị mới ngay; API áp dụng cùng kiểm tra quyền
 * VI: như các thuộc tính dự án khác. Slug mới chuyển tab hiện tại sang địa chỉ mới; slug cũ thành
 * VI: alias nên link đã chia sẻ vẫn dùng được.
 */
export function ProjectSettingsDialog({
   open,
   onOpenChange,
}: {
   open: boolean;
   onOpenChange: (open: boolean) => void;
}) {
   const { project, updateProject } = useLiveProjectData();
   const router = useRouter();
   const pathname = usePathname();
   const [name, setName] = useState('');
   const [icon, setIcon] = useState('');
   const [slug, setSlug] = useState('');
   const [saving, setSaving] = useState(false);

   useEffect(() => {
      if (!open || !project) return;
      setName(project.name);
      setIcon(project.icon ?? '');
      setSlug(project.slug ?? '');
   }, [open, project]);

   const error = projectNameError(name);
   const slugError = projectSlugError(slug);
   // Full address with the deployment base path, as it will be shared.
   // VI: Địa chỉ đầy đủ kèm base path của bản triển khai, đúng như khi chia sẻ.
   const preview =
      typeof window === 'undefined'
         ? ''
         : `${window.location.origin}${window.location.pathname.replace(/\/project\/[^/]+/, `/project/${slug}`)}`;

   const submit = async (event: FormEvent) => {
      event.preventDefault();
      if (error || slugError || saving || !project) return;
      setSaving(true);
      try {
         const changedSlug = slug !== project.slug;
         await updateProject({
            name: name.trim(),
            icon: icon.trim() || null,
            ...(changedSlug ? { slug } : {}),
         });
         toast.success('Project updated.');
         onOpenChange(false);
         if (changedSlug) {
            rememberProjectSlug(project.id, slug);
            const target = canonicalProjectPath(
               pathname,
               slug,
               `${window.location.search}${window.location.hash}`
            );
            if (target) router.replace(target);
         }
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
                     Rename the project, change its icon or the slug used in its links.
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
               <div className="grid gap-2">
                  <Label htmlFor="project-settings-slug">Slug</Label>
                  <Input
                     id="project-settings-slug"
                     value={slug}
                     maxLength={63}
                     spellCheck={false}
                     autoCapitalize="none"
                     onChange={(event) => setSlug(event.target.value)}
                     aria-invalid={Boolean(slugError)}
                     aria-describedby="project-settings-slug-help"
                  />
                  {slugError ? (
                     <p className="text-xs text-destructive">{slugError}</p>
                  ) : (
                     <p
                        id="project-settings-slug-help"
                        className="truncate text-xs text-muted-foreground"
                        title={preview}
                     >
                        {preview}
                     </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                     Old links keep working after a change; renaming the project does not change its
                     slug.
                  </p>
               </div>
               <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                     Cancel
                  </Button>
                  <Button type="submit" disabled={Boolean(error || slugError) || saving}>
                     {saving ? 'Saving…' : 'Save'}
                  </Button>
               </DialogFooter>
            </form>
         </DialogContent>
      </Dialog>
   );
}
