'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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

/** Workspace-scoped AI provider configuration. The browser never receives a saved API key. */
export default function AgentPersonalization() {
   const [provider, setProvider] = useState<Provider>('OPENAI');
   const [records, setRecords] = useState<ProviderRecord[]>([]);
   const [endpoint, setEndpoint] = useState<string>(PROVIDERS.OPENAI.endpoint);
   const [model, setModel] = useState<string>(PROVIDERS.OPENAI.model);
   const [apiKey, setApiKey] = useState('');
   const [canManage, setCanManage] = useState(false);
   const [loading, setLoading] = useState(true);
   const [saving, setSaving] = useState(false);
   const [message, setMessage] = useState<string | null>(null);

   useEffect(() => {
      let active = true;
      void (async () => {
         try {
            const workspace = await loadCurrentWorkspace();
            const response = await authenticatedFetch(
               `${api}/agent/providers?workspaceId=${workspace.id}`
            );
            if (!response.ok) throw new Error('Could not load Agent provider settings.');
            const payload = (await response.json()) as {
               data: { canManage: boolean; providers: ProviderRecord[] };
            };
            if (!active) return;
            setCanManage(payload.data.canManage);
            setRecords(payload.data.providers);
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
         description="Configure the AI provider used by Agent in this workspace. Only workspace owners and admins can change these settings."
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
