'use client';

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
import { Textarea } from '@/components/ui/textarea';
import { authenticatedFetch, loadCurrentWorkspace } from '@/lib/workspaces';
import { CheckCircle2, KeyRound, LoaderCircle, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { SettingsCard, SettingsRow, SettingsSection, SettingsShell } from './shared';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
const PROVIDERS = {
   OPENAI: { label: 'OpenAI', endpoint: 'https://api.openai.com/v1', model: 'gpt-4.1-mini' },
   GOOGLE: {
      label: 'Google Gemini',
      endpoint: 'https://generativelanguage.googleapis.com/v1beta',
      model: 'gemini-2.5-flash',
   },
} as const;
type Provider = keyof typeof PROVIDERS;

type ProviderRecord = {
   provider: Provider;
   endpoint: string;
   model: string;
   configured: boolean;
   enabled: boolean;
};

type ToolRecord = {
   key: string;
   title: string;
   description: string;
   installed: boolean;
};

type SkillRecord = ToolRecord & {
   config: { defaultPriority?: string; dueInDays?: number | null } | null;
   builtIn: boolean;
   instructions: string | null;
};

type CustomSkillDraft = { key?: string; name: string; description: string; instructions: string };

/** Workspace-scoped AI provider configuration. The browser never receives a saved API key. */
export default function AgentPersonalization() {
   const [provider, setProvider] = useState<Provider>('OPENAI');
   const [records, setRecords] = useState<ProviderRecord[]>([]);
   const [tools, setTools] = useState<ToolRecord[]>([]);
   const [skills, setSkills] = useState<SkillRecord[]>([]);
   const [endpoint, setEndpoint] = useState<string>(PROVIDERS.OPENAI.endpoint);
   const [model, setModel] = useState<string>(PROVIDERS.OPENAI.model);
   const [apiKey, setApiKey] = useState('');
   const [canManage, setCanManage] = useState(false);
   const [loading, setLoading] = useState(true);
   const [saving, setSaving] = useState(false);
   const [message, setMessage] = useState<string | null>(null);
   const [customSkill, setCustomSkill] = useState<CustomSkillDraft | null>(null);
   const [skillDetails, setSkillDetails] = useState<SkillRecord | null>(null);

   useEffect(() => {
      let active = true;
      void (async () => {
         try {
            const workspace = await loadCurrentWorkspace();
            const [providerResponse, toolResponse, skillResponse] = await Promise.all([
               authenticatedFetch(`${api}/agent/providers?workspaceId=${workspace.id}`),
               authenticatedFetch(`${api}/agent/tools?workspaceId=${workspace.id}`),
               authenticatedFetch(`${api}/agent/skills`),
            ]);
            if (!providerResponse.ok || !toolResponse.ok || !skillResponse.ok) {
               throw new Error('Could not load Agent settings.');
            }
            const payload = (await providerResponse.json()) as {
               data: { canManage: boolean; providers: ProviderRecord[] };
            };
            const toolPayload = (await toolResponse.json()) as {
               data: { tools: ToolRecord[] };
            };
            const skillPayload = (await skillResponse.json()) as {
               data: { skills: SkillRecord[] };
            };
            if (!active) return;
            setCanManage(payload.data.canManage);
            setRecords(payload.data.providers);
            setTools(toolPayload.data.tools);
            setSkills(skillPayload.data.skills);
            const selected =
               payload.data.providers.find((item) => item.enabled) ?? payload.data.providers[0];
            if (selected) {
               setProvider(selected.provider);
               setEndpoint(selected.endpoint);
               setModel(selected.model);
            }
         } catch (error) {
            if (active)
               setMessage(error instanceof Error ? error.message : 'Could not load settings.');
         } finally {
            if (active) setLoading(false);
         }
      })();
      return () => {
         active = false;
      };
   }, []);

   const selectedRecord = records.find((item) => item.provider === provider);

   const chooseProvider = (next: Provider) => {
      setProvider(next);
      const record = records.find((item) => item.provider === next);
      setEndpoint(record?.endpoint ?? PROVIDERS[next].endpoint);
      setModel(record?.model ?? PROVIDERS[next].model);
      setApiKey('');
      setMessage(null);
   };

   const changeTool = async (tool: ToolRecord) => {
      setSaving(true);
      setMessage(null);
      try {
         const workspace = await loadCurrentWorkspace();
         const response = await authenticatedFetch(
            `${api}/agent/tools/${tool.key}?workspaceId=${workspace.id}`,
            { method: tool.installed ? 'DELETE' : 'POST' }
         );
         const payload = (await response.json().catch(() => null)) as {
            data?: ToolRecord;
            message?: string;
         } | null;
         if (!response.ok || !payload?.data)
            throw new Error(payload?.message ?? 'Could not update tool.');
         setTools((current) =>
            current.map((item) => (item.key === tool.key ? payload.data! : item))
         );
      } catch (error) {
         setMessage(error instanceof Error ? error.message : 'Could not update tool.');
      } finally {
         setSaving(false);
      }
   };

   const changeSkill = async (skill: SkillRecord, action: 'install' | 'remove' | 'save') => {
      setSaving(true);
      setMessage(null);
      try {
         const response = await authenticatedFetch(`${api}/agent/skills/${skill.key}`, {
            method: action === 'install' ? 'POST' : action === 'remove' ? 'DELETE' : 'PUT',
            headers: action === 'save' ? { 'content-type': 'application/json' } : undefined,
            body:
               action === 'save'
                  ? JSON.stringify({
                       defaultPriority: skill.config?.defaultPriority ?? 'NONE',
                       dueInDays: skill.config?.dueInDays ?? null,
                    })
                  : undefined,
         });
         const payload = (await response.json().catch(() => null)) as {
            data?: SkillRecord;
            message?: string;
         } | null;
         if (!response.ok || !payload?.data)
            throw new Error(payload?.message ?? 'Could not update skill.');
         setSkills((current) =>
            current.map((item) => (item.key === skill.key ? payload.data! : item))
         );
         setSkillDetails((current) => (current?.key === skill.key ? payload.data! : current));
      } catch (error) {
         setMessage(error instanceof Error ? error.message : 'Could not update skill.');
      } finally {
         setSaving(false);
      }
   };

   const updateSkillConfig = (skillKey: string, config: NonNullable<SkillRecord['config']>) => {
      setSkills((current) =>
         current.map((skill) => (skill.key === skillKey ? { ...skill, config } : skill))
      );
   };

   const saveCustomSkill = async () => {
      if (!customSkill) return;
      setSaving(true);
      setMessage(null);
      try {
         const response = await authenticatedFetch(
            customSkill.key ? `${api}/agent/skills/${customSkill.key}` : `${api}/agent/skills`,
            {
               method: customSkill.key ? 'PUT' : 'POST',
               headers: { 'content-type': 'application/json' },
               body: JSON.stringify({
                  name: customSkill.name,
                  description: customSkill.description || undefined,
                  instructions: customSkill.instructions,
               }),
            }
         );
         const payload = (await response.json().catch(() => null)) as {
            data?: SkillRecord;
            message?: string;
         } | null;
         if (!response.ok || !payload?.data) {
            throw new Error(payload?.message ?? 'Could not save skill.');
         }
         setSkills((current) =>
            customSkill.key
               ? current.map((skill) => (skill.key === customSkill.key ? payload.data! : skill))
               : [...current, payload.data!]
         );
         setCustomSkill(null);
      } catch (error) {
         setMessage(error instanceof Error ? error.message : 'Could not save skill.');
      } finally {
         setSaving(false);
      }
   };

   const save = async () => {
      setSaving(true);
      setMessage(null);
      try {
         const workspace = await loadCurrentWorkspace();
         const response = await authenticatedFetch(
            `${api}/agent/providers/${provider}?workspaceId=${workspace.id}`,
            {
               method: 'PUT',
               headers: { 'content-type': 'application/json' },
               body: JSON.stringify({
                  endpoint,
                  model,
                  apiKey: apiKey || undefined,
                  enabled: true,
               }),
            }
         );
         const payload = (await response.json().catch(() => null)) as {
            data?: ProviderRecord;
            message?: string;
         } | null;
         const data = payload?.data;
         if (!response.ok || !data) {
            throw new Error(payload?.message ?? 'Could not save provider settings.');
         }
         setRecords((current) => [
            ...current
               .filter((item) => item.provider !== provider)
               .map((item) => ({ ...item, enabled: false })),
            data,
         ]);
         setApiKey('');
         setMessage(`${PROVIDERS[provider].label} is active for this workspace.`);
      } catch (error) {
         setMessage(error instanceof Error ? error.message : 'Could not save provider settings.');
      } finally {
         setSaving(false);
      }
   };

   return (
      <SettingsShell
         title="Agent personalization"
         description="Configure Agent's provider and workspace tools. Workspace owners and admins manage shared settings; personal skills belong only to you."
      >
         <SettingsSection
            title="AI provider"
            description="Select the provider that drafts plans. Activating one provider deactivates the other for this workspace."
         >
            <SettingsCard>
               {(Object.keys(PROVIDERS) as Provider[]).map((item) => {
                  const record = records.find((value) => value.provider === item);
                  return (
                     <SettingsRow
                        key={item}
                        title={PROVIDERS[item].label}
                        description={
                           record?.configured ? 'API key saved securely' : 'Not configured'
                        }
                        onClick={canManage ? () => chooseProvider(item) : undefined}
                        trailing={
                           record?.enabled ? (
                              <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600">
                                 <CheckCircle2 className="size-3.5" /> Active
                              </span>
                           ) : provider === item ? (
                              <span className="text-xs">Selected</span>
                           ) : undefined
                        }
                     />
                  );
               })}
            </SettingsCard>
         </SettingsSection>

         <SettingsSection
            title="Workspace tools"
            description="Tools retrieve live workspace data. Owners and admins can install or remove them for everyone in this workspace."
         >
            <SettingsCard>
               {tools.map((tool) => (
                  <SettingsRow
                     key={tool.key}
                     title={tool.title}
                     description={tool.description}
                     trailing={
                        canManage ? (
                           <Button
                              variant={tool.installed ? 'outline' : 'default'}
                              size="sm"
                              disabled={loading || saving}
                              onClick={() => void changeTool(tool)}
                           >
                              {tool.installed ? 'Remove' : 'Install'}
                           </Button>
                        ) : (
                           <span className="text-xs text-muted-foreground">
                              {tool.installed ? 'Installed' : 'Not installed'}
                           </span>
                        )
                     }
                  />
               ))}
            </SettingsCard>
         </SettingsSection>

         <SettingsSection
            title="Personal skills"
            description="Skills belong only to your account and supply preferences when Agent drafts a plan."
            action={
               <Button
                  size="sm"
                  onClick={() => setCustomSkill({ name: '', description: '', instructions: '' })}
               >
                  Create skill
               </Button>
            }
         >
            <SettingsCard>
               {skills.map((skill) => (
                  <div key={skill.key} className="border-b px-4 py-4 last:border-b-0">
                     <div className="flex items-center justify-between gap-3">
                        <div>
                           <p className="text-sm font-medium">{skill.title}</p>
                           <p className="text-xs text-muted-foreground">{skill.description}</p>
                        </div>
                        <div className="flex items-center gap-1">
                           <Button
                              variant="ghost"
                              size="sm"
                              disabled={loading}
                              onClick={() => setSkillDetails(skill)}
                           >
                              Details
                           </Button>
                           {!skill.builtIn && skill.installed && (
                              <Button
                                 variant="ghost"
                                 size="sm"
                                 disabled={saving}
                                 onClick={() =>
                                    setCustomSkill({
                                       key: skill.key,
                                       name: skill.title,
                                       description: skill.description,
                                       instructions: skill.instructions ?? '',
                                    })
                                 }
                              >
                                 Edit
                              </Button>
                           )}
                           <Button
                              variant={skill.installed ? 'outline' : 'default'}
                              size="sm"
                              disabled={loading || saving}
                              onClick={() =>
                                 void changeSkill(skill, skill.installed ? 'remove' : 'install')
                              }
                           >
                              {skill.installed ? 'Remove' : 'Install'}
                           </Button>
                        </div>
                     </div>
                     {skill.installed && skill.key === 'issue.defaults' && (
                        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                           <label className="grid gap-1.5 text-sm">
                              Default priority
                              <select
                                 className="h-9 rounded-md border bg-background px-3 text-sm"
                                 value={skill.config?.defaultPriority ?? 'NONE'}
                                 onChange={(event) =>
                                    updateSkillConfig(skill.key, {
                                       defaultPriority: event.target.value,
                                       dueInDays: skill.config?.dueInDays ?? null,
                                    })
                                 }
                              >
                                 {['NONE', 'LOW', 'MEDIUM', 'HIGH', 'URGENT'].map((priority) => (
                                    <option key={priority} value={priority}>
                                       {priority}
                                    </option>
                                 ))}
                              </select>
                           </label>
                           <label className="grid gap-1.5 text-sm">
                              Due in days
                              <Input
                                 type="number"
                                 min={1}
                                 max={365}
                                 placeholder="No default"
                                 value={skill.config?.dueInDays ?? ''}
                                 onChange={(event) =>
                                    updateSkillConfig(skill.key, {
                                       defaultPriority: skill.config?.defaultPriority ?? 'NONE',
                                       dueInDays: event.target.value
                                          ? Number(event.target.value)
                                          : null,
                                    })
                                 }
                              />
                           </label>
                           <Button
                              size="sm"
                              disabled={saving}
                              onClick={() => void changeSkill(skill, 'save')}
                           >
                              Save defaults
                           </Button>
                        </div>
                     )}
                  </div>
               ))}
            </SettingsCard>
         </SettingsSection>

         <Dialog open={customSkill !== null} onOpenChange={(open) => !open && setCustomSkill(null)}>
            <DialogContent className="sm:max-w-[560px]">
               <DialogHeader>
                  <DialogTitle>
                     {customSkill?.key ? 'Edit personal skill' : 'Create personal skill'}
                  </DialogTitle>
                  <DialogDescription>
                     Agent follows these instructions whenever it drafts a plan for you. They never
                     change workspace tools or another user&apos;s skills.
                  </DialogDescription>
               </DialogHeader>
               {customSkill && (
                  <div className="grid gap-3">
                     <label className="grid gap-1.5 text-sm">
                        Name
                        <Input
                           value={customSkill.name}
                           onChange={(event) =>
                              setCustomSkill({ ...customSkill, name: event.target.value })
                           }
                           placeholder="Example: Backend delivery defaults"
                        />
                     </label>
                     <label className="grid gap-1.5 text-sm">
                        Description
                        <Input
                           value={customSkill.description}
                           onChange={(event) =>
                              setCustomSkill({ ...customSkill, description: event.target.value })
                           }
                           placeholder="Optional short description"
                        />
                     </label>
                     <label className="grid gap-1.5 text-sm">
                        Instructions
                        <Textarea
                           value={customSkill.instructions}
                           onChange={(event) =>
                              setCustomSkill({ ...customSkill, instructions: event.target.value })
                           }
                           placeholder="For example: Draft backend issues with MEDIUM priority and include an API acceptance criterion."
                           className="min-h-32"
                        />
                     </label>
                  </div>
               )}
               <DialogFooter>
                  <Button variant="outline" onClick={() => setCustomSkill(null)} disabled={saving}>
                     Cancel
                  </Button>
                  <Button
                     onClick={() => void saveCustomSkill()}
                     disabled={
                        saving || !customSkill?.name.trim() || !customSkill.instructions.trim()
                     }
                  >
                     {saving ? 'Saving…' : 'Save skill'}
                  </Button>
               </DialogFooter>
            </DialogContent>
         </Dialog>

         <Dialog
            open={skillDetails !== null}
            onOpenChange={(open) => !open && setSkillDetails(null)}
         >
            <DialogContent className="sm:max-w-[560px]">
               <DialogHeader>
                  <DialogTitle>{skillDetails?.title}</DialogTitle>
                  <DialogDescription>{skillDetails?.description}</DialogDescription>
               </DialogHeader>
               {skillDetails && (
                  <div className="grid gap-4 text-sm">
                     <div className="grid gap-1">
                        <span className="font-medium">Scope</span>
                        <span className="text-muted-foreground">
                           Personal to your account. It is not shared with your workspace or team.
                        </span>
                     </div>
                     {skillDetails.key === 'issue.defaults' && (
                        <div className="grid gap-1">
                           <span className="font-medium">How it works</span>
                           <span className="text-muted-foreground">
                              Sets a default priority and due-date offset when Agent drafts issues.
                              Explicit values in your request always take precedence.
                           </span>
                        </div>
                     )}
                     {skillDetails.instructions && (
                        <div className="grid gap-1">
                           <span className="font-medium">Instructions</span>
                           <p className="whitespace-pre-wrap rounded-md border bg-muted/40 p-3 text-muted-foreground">
                              {skillDetails.instructions}
                           </p>
                        </div>
                     )}
                  </div>
               )}
               <DialogFooter>
                  <Button variant="outline" onClick={() => setSkillDetails(null)} disabled={saving}>
                     Close
                  </Button>
                  {skillDetails && !skillDetails.installed && (
                     <Button
                        disabled={saving}
                        onClick={() => void changeSkill(skillDetails, 'install')}
                     >
                        {saving ? 'Installing…' : 'Install skill'}
                     </Button>
                  )}
               </DialogFooter>
            </DialogContent>
         </Dialog>

         <SettingsSection
            title={`${PROVIDERS[provider].label} connection`}
            description="Use the official provider API URL. The key is encrypted before it is stored; leave it blank to keep the existing saved key."
         >
            <div className="grid gap-3">
               <label className="grid gap-1.5 text-sm">
                  Provider URL
                  <Input
                     value={endpoint}
                     disabled={!canManage || loading}
                     onChange={(event) => setEndpoint(event.target.value)}
                  />
               </label>
               <label className="grid gap-1.5 text-sm">
                  Model
                  <Input
                     value={model}
                     disabled={!canManage || loading}
                     onChange={(event) => setModel(event.target.value)}
                  />
               </label>
               <label className="grid gap-1.5 text-sm">
                  API key
                  <Input
                     value={apiKey}
                     type="password"
                     autoComplete="new-password"
                     placeholder={
                        selectedRecord?.configured
                           ? 'Saved key is retained when blank'
                           : 'Paste API key'
                     }
                     disabled={!canManage || loading}
                     onChange={(event) => setApiKey(event.target.value)}
                  />
               </label>
               <div className="flex items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                     <ShieldCheck className="size-4" /> Keys are never returned to this browser.
                  </span>
                  <Button onClick={() => void save()} disabled={!canManage || loading || saving}>
                     {saving ? (
                        <LoaderCircle className="size-4 animate-spin" />
                     ) : (
                        <KeyRound className="size-4" />
                     )}
                     Save and activate
                  </Button>
               </div>
               {message && <p className="text-sm text-muted-foreground">{message}</p>}
            </div>
         </SettingsSection>
      </SettingsShell>
   );
}
