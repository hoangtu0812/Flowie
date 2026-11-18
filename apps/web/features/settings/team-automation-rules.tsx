'use client';

import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
   Select,
   SelectContent,
   SelectItem,
   SelectTrigger,
   SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { responseData } from '@/lib/http';
import { authenticatedFetch } from '@/lib/workspaces';
import { SettingsCard, SettingsRow } from './shared';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

const TRIGGERS: Record<string, string> = {
   'issue.created': 'Issue is created',
   'issue.status_changed': 'Status changes',
   'issue.assigned': 'Assignee changes',
   'issue.labeled': 'A label is added',
   'issue.subissues_completed': 'All sub-issues are closed',
};
const ACTIONS: Record<string, string> = {
   set_status: 'Set status',
   assign: 'Assign to',
   add_label: 'Add label',
   remove_label: 'Remove label',
   set_priority: 'Set priority',
   comment: 'Comment',
   notify: 'Notify',
};
const PRIORITIES = ['NONE', 'LOW', 'MEDIUM', 'HIGH', 'URGENT'];
const ISSUE_TYPES = ['TASK', 'BUG', 'EPIC'];
const UNASSIGNED = 'unassigned';

type Option = { id: string; name: string };
type Options = { statuses: Option[]; labels: Option[]; members: Option[]; projects: Option[] };
type Conditions = Record<
   'issueTypes' | 'priorities' | 'labelIds' | 'projectIds' | 'statusIds',
   string[]
>;
// One loose shape for every action type keeps the form to one row component; the API validates it.
// VI: Một kiểu chung cho mọi loại hành động để form chỉ cần một component dòng; API kiểm tra lại.
type Action = {
   type: string;
   statusId?: string;
   userId?: string | null;
   labelId?: string;
   priority?: string;
   body?: string;
   userIds?: string[];
};
type Rule = {
   id: string;
   name: string;
   enabled: boolean;
   trigger: string;
   conditions: Partial<Conditions>;
   actions: Action[];
   actor: { id: string; name: string } | null;
};
type Run = {
   id: string;
   ruleName: string;
   issue: { identifier: string; title: string };
   status: 'SUCCEEDED' | 'FAILED';
   message: string | null;
   createdAt: string;
};
type Draft = Omit<Rule, 'id' | 'actor' | 'conditions'> & { id?: string; conditions: Conditions };

const emptyConditions = (): Conditions => ({
   issueTypes: [],
   priorities: [],
   labelIds: [],
   projectIds: [],
   statusIds: [],
});

/**
 * Team automation rules: members see the rules and recent runs, the team lead or a workspace
 * administrator creates, edits, turns off and deletes them (DTD-903).
 * VI: Rule tự động hoá của team: thành viên xem rule và các lần chạy gần nhất, LEAD của team hoặc
 * VI: admin workspace tạo, sửa, tắt và xoá rule (DTD-903).
 */
export function TeamAutomationRules({
   workspaceId,
   teamId,
}: {
   workspaceId: string;
   teamId: string;
}) {
   const [rules, setRules] = useState<Rule[]>([]);
   const [runs, setRuns] = useState<Run[]>([]);
   const [canManage, setCanManage] = useState(false);
   const [options, setOptions] = useState<Options>();
   const [draft, setDraft] = useState<Draft>();
   const [error, setError] = useState<string>();
   const base = `${api}/teams/${teamId}/automation-rules`;
   const query = `workspaceId=${encodeURIComponent(workspaceId)}`;

   const load = useCallback(async () => {
      try {
         const data = await responseData<{ rules: Rule[]; runs: Run[]; canManage: boolean }>(
            await authenticatedFetch(`${base}?${query}`),
            'Could not load automation rules.'
         );
         setRules(data.rules);
         setRuns(data.runs);
         setCanManage(data.canManage);
      } catch (caught) {
         setError(caught instanceof Error ? caught.message : 'Could not load automation rules.');
      }
   }, [base, query]);

   useEffect(() => {
      void load();
      void authenticatedFetch(`${api}/issues/options?${query}&teamId=${encodeURIComponent(teamId)}`)
         .then((response) => responseData<Options>(response))
         .then(setOptions)
         .catch(() => setOptions({ statuses: [], labels: [], members: [], projects: [] }));
   }, [load, query, teamId]);

   async function save(rule: Draft) {
      // Only the editable fields: the API refuses unknown ones such as `actor` or `createdAt`.
      // VI: Chỉ gửi các trường sửa được: API từ chối trường lạ như `actor` hay `createdAt`.
      const { id, name, enabled, trigger, conditions, actions } = rule;
      const body = { name, enabled, trigger, conditions, actions };
      await responseData(
         await authenticatedFetch(id ? `${base}/${id}?${query}` : `${base}?${query}`, {
            method: id ? 'PUT' : 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
         }),
         'Could not save the rule.'
      );
      await load();
   }

   async function remove(rule: Rule) {
      if (!window.confirm(`Delete the rule ${rule.name}?`)) return;
      try {
         await responseData(
            await authenticatedFetch(`${base}/${rule.id}?${query}`, { method: 'DELETE' }),
            'Could not delete the rule.'
         );
         await load();
      } catch (caught) {
         setError(caught instanceof Error ? caught.message : 'Could not delete the rule.');
      }
   }

   const edit = (rule?: Rule) =>
      setDraft(
         rule
            ? { ...rule, conditions: { ...emptyConditions(), ...rule.conditions } }
            : {
                 name: '',
                 enabled: true,
                 trigger: 'issue.subissues_completed',
                 conditions: emptyConditions(),
                 actions: [{ type: 'set_status' }],
              }
      );

   return (
      <div className="space-y-3" data-testid="automation-rules">
         {error && <p className="text-sm text-destructive">{error}</p>}
         <SettingsCard>
            {rules.length === 0 && (
               <SettingsRow
                  icon={<Zap className="size-4" />}
                  title="No rules yet"
                  description="Rules run in the background after a change is saved."
               />
            )}
            {rules.map((rule) => (
               <div key={rule.id} data-testid="automation-rule-row">
                  <SettingsRow
                     icon={<Zap className="size-4" />}
                     wrap
                     title={rule.name}
                     description={`When ${TRIGGERS[rule.trigger]?.toLowerCase() ?? rule.trigger} → ${rule.actions
                        .map((action) => ACTIONS[action.type] ?? action.type)
                        .join(', ')}${rule.actor ? ` · acts as ${rule.actor.name}` : ''}`}
                     trailing={
                        canManage ? (
                           <>
                              <Switch
                                 aria-label={`Enable ${rule.name}`}
                                 checked={rule.enabled}
                                 onCheckedChange={(enabled) =>
                                    void save({
                                       ...rule,
                                       enabled,
                                       conditions: { ...emptyConditions(), ...rule.conditions },
                                    }).catch((caught: Error) => setError(caught.message))
                                 }
                              />
                              <Button size="xs" variant="ghost" onClick={() => edit(rule)}>
                                 Edit
                              </Button>
                              <Button size="xs" variant="ghost" onClick={() => void remove(rule)}>
                                 Delete
                              </Button>
                           </>
                        ) : (
                           <span>{rule.enabled ? 'On' : 'Off'}</span>
                        )
                     }
                  />
               </div>
            ))}
            {canManage && !draft && (
               <SettingsRow
                  title="New rule"
                  trailing={
                     <Button size="xs" variant="outline" onClick={() => edit()}>
                        <Plus className="size-3.5" /> Add rule
                     </Button>
                  }
               />
            )}
         </SettingsCard>
         {draft && options && (
            <RuleForm
               draft={draft}
               options={options}
               onCancel={() => setDraft(undefined)}
               onSave={async (rule) => {
                  await save(rule);
                  setDraft(undefined);
               }}
            />
         )}
         {runs.length > 0 && (
            <SettingsCard>
               <div className="px-4 py-2 text-xs font-medium text-muted-foreground">
                  Recent runs
               </div>
               {runs.map((run) => (
                  <div
                     key={run.id}
                     className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2 text-xs"
                     data-testid="automation-run"
                  >
                     <span className="text-muted-foreground">
                        {new Date(run.createdAt).toLocaleString()}
                     </span>
                     <span className="font-medium">{run.ruleName}</span>
                     <span>{run.issue.identifier}</span>
                     <span
                        className={
                           run.status === 'FAILED' ? 'text-destructive' : 'text-muted-foreground'
                        }
                     >
                        {run.status === 'FAILED'
                           ? `Failed: ${run.message ?? ''}`
                           : (run.message ?? 'Done')}
                     </span>
                  </div>
               ))}
            </SettingsCard>
         )}
      </div>
   );
}

function Pick({
   label,
   value,
   options,
   onChange,
}: {
   label: string;
   value: string | undefined;
   options: Option[];
   onChange: (value: string) => void;
}) {
   return (
      <Select value={value} onValueChange={onChange}>
         <SelectTrigger aria-label={label} className="h-8 min-w-40">
            <SelectValue placeholder={label} />
         </SelectTrigger>
         <SelectContent>
            {options.map((option) => (
               <SelectItem key={option.id} value={option.id}>
                  {option.name}
               </SelectItem>
            ))}
         </SelectContent>
      </Select>
   );
}

function RuleForm({
   draft,
   options,
   onCancel,
   onSave,
}: {
   draft: Draft;
   options: Options;
   onCancel: () => void;
   onSave: (rule: Draft) => Promise<void>;
}) {
   const [value, setValue] = useState(draft);
   const [saving, setSaving] = useState(false);
   const [error, setError] = useState<string>();
   const named = (items: string[]) => items.map((item) => ({ id: item, name: item }));
   const conditionGroups: Array<[keyof Conditions, string, Option[]]> = [
      ['issueTypes', 'Issue type', named(ISSUE_TYPES)],
      ['priorities', 'Priority', named(PRIORITIES)],
      ['statusIds', 'Status', options.statuses],
      ['labelIds', 'Label', options.labels],
      ['projectIds', 'Project', options.projects],
   ];
   const setAction = (index: number, action: Action) =>
      setValue({
         ...value,
         actions: value.actions.map((item, at) => (at === index ? action : item)),
      });

   async function submit(event: FormEvent) {
      event.preventDefault();
      setSaving(true);
      setError(undefined);
      try {
         await onSave(value);
      } catch (caught) {
         setError(caught instanceof Error ? caught.message : 'Could not save the rule.');
      } finally {
         setSaving(false);
      }
   }

   return (
      <form
         className="space-y-4 rounded-md border p-3"
         onSubmit={submit}
         data-testid="automation-rule-form"
      >
         <div>
            <Label htmlFor="automation-rule-name">Name</Label>
            <Input
               id="automation-rule-name"
               className="mt-1"
               value={value.name}
               maxLength={120}
               onChange={(event) => setValue({ ...value, name: event.target.value })}
               required
            />
         </div>
         <div className="space-y-1">
            <Label>When</Label>
            <Pick
               label="Trigger"
               value={value.trigger}
               options={Object.entries(TRIGGERS).map(([id, name]) => ({ id, name }))}
               onChange={(trigger) => setValue({ ...value, trigger })}
            />
         </div>
         <fieldset className="space-y-2">
            <legend className="text-sm font-medium">
               Only if (leave a group empty to match any value)
            </legend>
            {conditionGroups.map(([key, title, items]) =>
               items.length ? (
                  <div key={key} className="flex flex-wrap items-center gap-x-4 gap-y-1">
                     <span className="w-20 text-xs text-muted-foreground">{title}</span>
                     {items.map((item) => (
                        <label key={item.id} className="flex items-center gap-1.5 text-sm">
                           <Checkbox
                              checked={value.conditions[key].includes(item.id)}
                              onCheckedChange={(checked) =>
                                 setValue({
                                    ...value,
                                    conditions: {
                                       ...value.conditions,
                                       [key]: checked
                                          ? [...value.conditions[key], item.id]
                                          : value.conditions[key].filter((id) => id !== item.id),
                                    },
                                 })
                              }
                           />
                           {item.name}
                        </label>
                     ))}
                  </div>
               ) : null
            )}
         </fieldset>
         <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Then</legend>
            {value.actions.map((action, index) => (
               <div
                  key={index}
                  className="flex flex-wrap items-center gap-2"
                  data-testid="automation-action"
               >
                  <Pick
                     label="Action"
                     value={action.type}
                     options={Object.entries(ACTIONS).map(([id, name]) => ({ id, name }))}
                     onChange={(type) => setAction(index, { type })}
                  />
                  {action.type === 'set_status' && (
                     <Pick
                        label="Status"
                        value={action.statusId}
                        options={options.statuses}
                        onChange={(statusId) => setAction(index, { type: action.type, statusId })}
                     />
                  )}
                  {action.type === 'assign' && (
                     <Pick
                        label="Person"
                        value={action.userId ?? UNASSIGNED}
                        options={[
                           { id: UNASSIGNED, name: 'Nobody (unassign)' },
                           ...options.members,
                        ]}
                        onChange={(userId) =>
                           setAction(index, {
                              type: action.type,
                              userId: userId === UNASSIGNED ? null : userId,
                           })
                        }
                     />
                  )}
                  {(action.type === 'add_label' || action.type === 'remove_label') && (
                     <Pick
                        label="Label"
                        value={action.labelId}
                        options={options.labels}
                        onChange={(labelId) => setAction(index, { type: action.type, labelId })}
                     />
                  )}
                  {action.type === 'set_priority' && (
                     <Pick
                        label="Priority"
                        value={action.priority}
                        options={named(PRIORITIES)}
                        onChange={(priority) => setAction(index, { type: action.type, priority })}
                     />
                  )}
                  {action.type === 'notify' && (
                     <Pick
                        label="Person"
                        value={action.userIds?.[0]}
                        options={options.members}
                        onChange={(userId) =>
                           setAction(index, { type: action.type, userIds: [userId] })
                        }
                     />
                  )}
                  {action.type === 'comment' && (
                     <Input
                        aria-label="Comment text"
                        className="h-8 min-w-60 flex-1"
                        value={action.body ?? ''}
                        maxLength={5000}
                        onChange={(event) =>
                           setAction(index, { type: action.type, body: event.target.value })
                        }
                        required
                     />
                  )}
                  <Button
                     type="button"
                     size="xxs"
                     variant="ghost"
                     aria-label="Remove action"
                     disabled={value.actions.length === 1}
                     onClick={() =>
                        setValue({
                           ...value,
                           actions: value.actions.filter((_, at) => at !== index),
                        })
                     }
                  >
                     <Trash2 className="size-3.5" />
                  </Button>
               </div>
            ))}
            {value.actions.length < 10 && (
               <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  onClick={() =>
                     setValue({ ...value, actions: [...value.actions, { type: 'comment' }] })
                  }
               >
                  <Plus className="size-3.5" /> Add action
               </Button>
            )}
         </fieldset>
         {error && <p className="text-sm text-destructive">{error}</p>}
         <div className="flex gap-2">
            <Button type="submit" disabled={saving}>
               {saving ? 'Saving…' : value.id ? 'Save rule' : 'Create rule'}
            </Button>
            <Button type="button" variant="outline" onClick={onCancel}>
               Cancel
            </Button>
         </div>
      </form>
   );
}
