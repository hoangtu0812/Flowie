'use client';

import {
   DropdownMenu,
   DropdownMenuCheckboxItem,
   DropdownMenuContent,
   DropdownMenuLabel,
   DropdownMenuSeparator,
   DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import type { ProjectListLabel } from './projects';

interface ProjectLabelSelectorProps {
   labels: ProjectListLabel[];
   availableLabels: ProjectListLabel[];
   disabled?: boolean;
   onLabelsChange?: (labelIds: string[]) => Promise<void>;
}

/** Minimal original-list control for assigning the workspace's persisted Project labels. */
export function ProjectLabelSelector({
   labels,
   availableLabels,
   disabled,
   onLabelsChange,
}: ProjectLabelSelectorProps) {
   const [saving, setSaving] = useState(false);
   const [message, setMessage] = useState<string>();
   const selectedIds = new Set(labels.map((label) => label.id));

   const toggle = async (labelId: string, checked: boolean) => {
      if (!onLabelsChange || disabled || saving) return;
      const next = checked
         ? [...new Set([...selectedIds, labelId])]
         : [...selectedIds].filter((id) => id !== labelId);
      setSaving(true);
      setMessage(undefined);
      try {
         await onLabelsChange(next);
      } catch (caught) {
         setMessage(caught instanceof Error ? caught.message : 'Could not update project labels.');
      } finally {
         setSaving(false);
      }
   };

   return (
      <DropdownMenu>
         <DropdownMenuTrigger asChild>
            <button
               type="button"
               disabled={disabled || saving}
               title={
                  disabled
                     ? 'Project labels are not available for this view'
                     : 'Add or remove project labels'
               }
               className="inline-flex size-5 items-center justify-center rounded border border-dashed text-muted-foreground hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
               <Plus className="size-3" />
            </button>
         </DropdownMenuTrigger>
         <DropdownMenuContent align="start" className="w-52">
            <DropdownMenuLabel>Project labels</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {availableLabels.length === 0 && (
               <p className="px-2 py-1.5 text-xs text-muted-foreground">
                  Create labels in Settings first.
               </p>
            )}
            {availableLabels.map((label) => (
               <DropdownMenuCheckboxItem
                  key={label.id}
                  checked={selectedIds.has(label.id)}
                  onSelect={(event) => event.preventDefault()}
                  onCheckedChange={(checked) => void toggle(label.id, checked === true)}
               >
                  <span
                     className="size-2.5 rounded-full"
                     style={{ backgroundColor: label.color }}
                  />
                  <span className="truncate">{label.name}</span>
               </DropdownMenuCheckboxItem>
            ))}
            {message && <p className="px-2 py-1.5 text-xs text-destructive">{message}</p>}
         </DropdownMenuContent>
      </DropdownMenu>
   );
}
