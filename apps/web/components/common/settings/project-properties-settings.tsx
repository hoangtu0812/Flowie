'use client';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
   Dialog,
   DialogContent,
   DialogFooter,
   DialogHeader,
   DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
   Select,
   SelectContent,
   SelectItem,
   SelectTrigger,
   SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { loadCurrentWorkspace } from '@/lib/workspaces';
import { ListPlus, Plus } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { SettingsSection, SettingsShell } from './shared';

type CustomFieldType = 'TEXT' | 'NUMBER' | 'DATE' | 'SELECT' | 'MULTI_SELECT' | 'BOOLEAN' | 'URL';

type CustomField = {
   id: string;
   name: string;
   type: CustomFieldType;
   description: string | null;
   options: string[] | null;
   required: boolean;
   position: number;
};

type FieldDraft = {
   name: string;
   type: CustomFieldType;
   description: string;
   options: string;
   required: boolean;
};

const EMPTY_DRAFT: FieldDraft = {
   name: '',
   type: 'TEXT',
   description: '',
   options: '',
   required: false,
};

const TYPES: Array<{ value: CustomFieldType; label: string }> = [
   { value: 'TEXT', label: 'Text' },
   { value: 'NUMBER', label: 'Number' },
   { value: 'DATE', label: 'Date' },
   { value: 'SELECT', label: 'Select' },
   { value: 'MULTI_SELECT', label: 'Multi-select' },
   { value: 'BOOLEAN', label: 'Checkbox' },
   { value: 'URL', label: 'URL' },
];

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
const typeLabel = (type: CustomFieldType) =>
   TYPES.find((candidate) => candidate.value === type)?.label ?? type;
const usesOptions = (type: CustomFieldType) => type === 'SELECT' || type === 'MULTI_SELECT';

export default function ProjectPropertiesSettings() {
   const [workspaceId, setWorkspaceId] = useState<string>();
   const [fields, setFields] = useState<CustomField[]>([]);
   const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
   const [selected, setSelected] = useState<CustomField>();
   const [draft, setDraft] = useState<FieldDraft>(EMPTY_DRAFT);
   const [open, setOpen] = useState(false);
   const [saving, setSaving] = useState(false);
   const [message, setMessage] = useState<string>();

   const load = useCallback(async () => {
      const id = (await loadCurrentWorkspace()).id;
      setWorkspaceId(id);
      const response = await fetch(`${api}/projects/custom-fields?workspaceId=${id}`, {
         credentials: 'include',
      });
      if (!response.ok) throw new Error('Could not load project properties.');
      setFields(((await response.json()) as { data: CustomField[] }).data);
   }, []);

   useEffect(() => {
      void load()
         .then(() => setState('ready'))
         .catch(() => setState('error'));
   }, [load]);

   const orderedFields = useMemo(
      () => [...fields].sort((left, right) => left.position - right.position),
      [fields]
   );

   const showCreate = () => {
      setSelected(undefined);
      setDraft(EMPTY_DRAFT);
      setMessage(undefined);
      setOpen(true);
   };

   const showEdit = (field: CustomField) => {
      setSelected(field);
      setDraft({
         name: field.name,
         type: field.type,
         description: field.description ?? '',
         options: (field.options ?? []).join(', '),
         required: field.required,
      });
      setMessage(undefined);
      setOpen(true);
   };

   const save = async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!workspaceId || !draft.name.trim()) return;
      const options = usesOptions(draft.type)
         ? [
              ...new Set(
                 draft.options
                    .split(',')
                    .map((option) => option.trim())
                    .filter(Boolean)
              ),
           ]
         : undefined;
      if (usesOptions(draft.type) && !options?.length) {
         setMessage('Add at least one option.');
         return;
      }

      setSaving(true);
      setMessage(undefined);
      try {
         const response = await fetch(
            selected
               ? `${api}/projects/custom-fields/${selected.id}?workspaceId=${workspaceId}`
               : `${api}/projects/custom-fields`,
            {
               method: selected ? 'PATCH' : 'POST',
               credentials: 'include',
               headers: { 'content-type': 'application/json' },
               body: JSON.stringify({
                  ...(selected ? {} : { workspaceId, position: fields.length }),
                  name: draft.name.trim(),
                  type: draft.type,
                  description: draft.description.trim() || undefined,
                  options,
                  required: draft.required,
               }),
            }
         );
         if (!response.ok) {
            const payload = (await response.json().catch(() => null)) as {
               message?: string | string[];
            } | null;
            throw new Error(
               Array.isArray(payload?.message)
                  ? payload.message.join(' ')
                  : (payload?.message ?? 'Could not save project property.')
            );
         }
         await load();
         setOpen(false);
      } catch (caught) {
         setMessage(caught instanceof Error ? caught.message : 'Could not save project property.');
      } finally {
         setSaving(false);
      }
   };

   const remove = async () => {
      if (!workspaceId || !selected) return;
      setSaving(true);
      setMessage(undefined);
      try {
         const response = await fetch(
            `${api}/projects/custom-fields/${selected.id}?workspaceId=${workspaceId}`,
            { method: 'DELETE', credentials: 'include' }
         );
         if (!response.ok) {
            const payload = (await response.json().catch(() => null)) as {
               message?: string;
            } | null;
            throw new Error(payload?.message ?? 'Could not delete project property.');
         }
         await load();
         setOpen(false);
      } catch (caught) {
         setMessage(
            caught instanceof Error ? caught.message : 'Could not delete project property.'
         );
      } finally {
         setSaving(false);
      }
   };

   return (
      <SettingsShell
         title="Project properties"
         description="Create workspace properties that can be set on every project"
      >
         <SettingsSection
            action={
               <Button size="sm" onClick={showCreate}>
                  <Plus className="size-4" /> New property
               </Button>
            }
         >
            <div className="rounded-lg border bg-container overflow-hidden">
               {state === 'loading' && (
                  <div className="px-4 py-4 text-sm text-muted-foreground">
                     Loading project properties…
                  </div>
               )}
               {state === 'error' && (
                  <div className="px-4 py-4 text-sm text-destructive">
                     Could not load project properties.
                  </div>
               )}
               {state === 'ready' && orderedFields.length === 0 && (
                  <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
                     <ListPlus className="size-8 text-muted-foreground" />
                     <p className="text-sm font-medium">No project properties</p>
                     <p className="text-xs text-muted-foreground">
                        Create a property to capture workspace-specific project data.
                     </p>
                  </div>
               )}
               {state === 'ready' &&
                  orderedFields.map((field) => (
                     <button
                        key={field.id}
                        type="button"
                        onClick={() => showEdit(field)}
                        className="w-full flex items-center gap-3 border-b last:border-b-0 px-4 py-3 text-left hover:bg-sidebar/50"
                     >
                        <span className="inline-flex size-8 items-center justify-center rounded-md bg-muted/50 shrink-0">
                           <ListPlus className="size-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                           <span className="block text-sm font-medium truncate">{field.name}</span>
                           <span className="block text-xs text-muted-foreground truncate">
                              {field.description || typeLabel(field.type)}
                           </span>
                        </span>
                        <span className="text-xs text-muted-foreground">
                           {typeLabel(field.type)}
                           {field.required ? ' · Required' : ''}
                        </span>
                     </button>
                  ))}
            </div>
         </SettingsSection>

         <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent>
               <DialogHeader>
                  <DialogTitle>
                     {selected ? 'Edit project property' : 'New project property'}
                  </DialogTitle>
               </DialogHeader>
               <form className="space-y-4" onSubmit={save}>
                  <div className="space-y-2">
                     <Label htmlFor="project-property-name">Name</Label>
                     <Input
                        id="project-property-name"
                        value={draft.name}
                        onChange={(event) =>
                           setDraft((current) => ({ ...current, name: event.target.value }))
                        }
                        maxLength={80}
                        required
                     />
                  </div>
                  <div className="space-y-2">
                     <Label>Type</Label>
                     <Select
                        value={draft.type}
                        onValueChange={(type: CustomFieldType) =>
                           setDraft((current) => ({ ...current, type }))
                        }
                     >
                        <SelectTrigger>
                           <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                           {TYPES.map((type) => (
                              <SelectItem key={type.value} value={type.value}>
                                 {type.label}
                              </SelectItem>
                           ))}
                        </SelectContent>
                     </Select>
                  </div>
                  {usesOptions(draft.type) && (
                     <div className="space-y-2">
                        <Label htmlFor="project-property-options">Options</Label>
                        <Input
                           id="project-property-options"
                           value={draft.options}
                           onChange={(event) =>
                              setDraft((current) => ({ ...current, options: event.target.value }))
                           }
                           placeholder="Option one, Option two"
                        />
                        <p className="text-xs text-muted-foreground">
                           Separate options with commas.
                        </p>
                     </div>
                  )}
                  <div className="space-y-2">
                     <Label htmlFor="project-property-description">Description</Label>
                     <Textarea
                        id="project-property-description"
                        value={draft.description}
                        onChange={(event) =>
                           setDraft((current) => ({ ...current, description: event.target.value }))
                        }
                        maxLength={500}
                     />
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                     <Checkbox
                        checked={draft.required}
                        onCheckedChange={(checked) =>
                           setDraft((current) => ({ ...current, required: checked === true }))
                        }
                     />
                     Required on projects
                  </label>
                  {message && <p className="text-sm text-destructive">{message}</p>}
                  <DialogFooter className="sm:justify-between">
                     {selected ? (
                        <Button
                           type="button"
                           variant="ghost"
                           className="text-destructive"
                           disabled={saving}
                           onClick={() => void remove()}
                        >
                           Delete
                        </Button>
                     ) : (
                        <span />
                     )}
                     <div className="flex gap-2">
                        <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                           Cancel
                        </Button>
                        <Button type="submit" disabled={saving || !draft.name.trim()}>
                           {saving ? 'Saving…' : 'Save'}
                        </Button>
                     </div>
                  </DialogFooter>
               </form>
            </DialogContent>
         </Dialog>
      </SettingsShell>
   );
}
