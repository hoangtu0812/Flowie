'use client';

import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
   Dialog,
   DialogContent,
   DialogDescription,
   DialogHeader,
   DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { responseData, responseEnvelope } from '@/lib/http';
import { authenticatedFetch, loadCurrentWorkspace } from '@/lib/workspaces';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export type WebhookDelivery = {
   id: string;
   event: string;
   attempts: number;
   status: number | null;
   durationMs: number | null;
   error: string | null;
   deliveredAt: string | null;
   failedAt: string | null;
   nextAttemptAt: string | null;
   createdAt: string;
};

export type OutgoingWebhook = {
   id: string;
   name: string;
   url: string;
   events: string[];
   enabled: boolean;
   consecutiveFailures: number;
   disabledReason: string | null;
   lastDelivery: {
      event: string;
      status: number | null;
      deliveredAt: string | null;
      failedAt: string | null;
      error: string | null;
      createdAt: string;
   } | null;
};

type Draft = { id?: string; name: string; url: string; events: string[]; enabled: boolean };

// One request helper so every call carries the workspace and surfaces the API's message.
// VI: Một hàm gọi chung để mọi request mang workspace và hiện đúng thông báo lỗi của API.
async function call<T>(path: string, init?: RequestInit): Promise<T> {
   const workspaceId = (await loadCurrentWorkspace()).id;
   const response = await authenticatedFetch(
      `${api}/integrations/webhooks${path}?workspaceId=${workspaceId}`,
      init?.body ? { ...init, headers: { 'content-type': 'application/json' } } : init
   );
   return responseData<T>(response, 'The webhook request failed.');
}

export async function loadOutgoingWebhooks(): Promise<{ data: OutgoingWebhook[]; events: string[] }> {
   const workspaceId = (await loadCurrentWorkspace()).id;
   const response = await authenticatedFetch(`${api}/integrations/webhooks?workspaceId=${workspaceId}`);
   const envelope = await responseEnvelope<OutgoingWebhook[], { events: string[] }>(
      response,
      'Could not load webhooks.'
   );
   return { data: envelope.data, events: envelope.meta?.events ?? [] };
}

export function deliverySummary(delivery: {
   status: number | null;
   deliveredAt: string | null;
   failedAt: string | null;
   error: string | null;
}): string {
   if (delivery.deliveredAt) return `Delivered (${delivery.status ?? 'OK'})`;
   if (delivery.failedAt) return `Failed: ${delivery.error ?? 'error'}`;
   return delivery.error ? `Retrying after ${delivery.error}` : 'Pending';
}

function WebhookForm({
   draft,
   events,
   onCancel,
   onSaved,
}: {
   draft: Draft;
   events: string[];
   onCancel: () => void;
   onSaved: (webhook: OutgoingWebhook & { secret?: string }) => void;
}) {
   const [value, setValue] = useState(draft);
   const [saving, setSaving] = useState(false);
   const [error, setError] = useState<string>();

   async function submit(event: FormEvent) {
      event.preventDefault();
      setSaving(true);
      setError(undefined);
      try {
         const body = JSON.stringify({
            name: value.name,
            url: value.url,
            events: value.events,
            enabled: value.enabled,
         });
         onSaved(
            await call<OutgoingWebhook & { secret?: string }>(value.id ? `/${value.id}` : '', {
               method: value.id ? 'PUT' : 'POST',
               body,
            })
         );
      } catch (caught) {
         setError(caught instanceof Error ? caught.message : 'Could not save the webhook.');
      } finally {
         setSaving(false);
      }
   }

   return (
      <form className="space-y-4 rounded-md border p-3" onSubmit={submit} data-testid="webhook-form">
         <div>
            <Label htmlFor="webhook-name">Name</Label>
            <Input
               id="webhook-name"
               className="mt-1"
               value={value.name}
               maxLength={120}
               onChange={(event) => setValue({ ...value, name: event.target.value })}
               required
            />
         </div>
         <div>
            <Label htmlFor="webhook-url">Payload URL</Label>
            <Input
               id="webhook-url"
               className="mt-1"
               type="url"
               value={value.url}
               placeholder="https://example.com/flowie-events"
               onChange={(event) => setValue({ ...value, url: event.target.value })}
               required
            />
         </div>
         <fieldset>
            <legend className="text-sm font-medium">Events</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
               {events.map((name) => (
                  <label key={name} className="flex items-center gap-2 text-sm">
                     <Checkbox
                        checked={value.events.includes(name)}
                        onCheckedChange={(checked) =>
                           setValue({
                              ...value,
                              events: checked
                                 ? [...value.events, name]
                                 : value.events.filter((item) => item !== name),
                           })
                        }
                     />
                     <code className="text-xs">{name}</code>
                  </label>
               ))}
            </div>
         </fieldset>
         {value.id && (
            <div className="flex items-center justify-between gap-4">
               <Label htmlFor="webhook-enabled">Active</Label>
               <Switch
                  id="webhook-enabled"
                  checked={value.enabled}
                  onCheckedChange={(enabled) => setValue({ ...value, enabled })}
               />
            </div>
         )}
         {error && <p className="text-sm text-destructive">{error}</p>}
         <div className="flex gap-2">
            <Button type="submit" disabled={saving || !value.events.length}>
               {saving ? 'Saving…' : value.id ? 'Save webhook' : 'Add webhook'}
            </Button>
            <Button type="button" variant="outline" onClick={onCancel}>
               Cancel
            </Button>
         </div>
      </form>
   );
}

export function OutgoingWebhooksDialog({
   open,
   onOpenChange,
   onChanged,
}: {
   open: boolean;
   onOpenChange: (open: boolean) => void;
   onChanged?: (webhooks: OutgoingWebhook[]) => void;
}) {
   const [webhooks, setWebhooks] = useState<OutgoingWebhook[]>([]);
   const [events, setEvents] = useState<string[]>([]);
   const [draft, setDraft] = useState<Draft>();
   const [secret, setSecret] = useState<{ name: string; value: string }>();
   const [deliveries, setDeliveries] = useState<{ id: string; items: WebhookDelivery[] }>();
   const [message, setMessage] = useState<string>();

   const reload = useCallback(async () => {
      try {
         const loaded = await loadOutgoingWebhooks();
         setWebhooks(loaded.data);
         setEvents(loaded.events);
         onChanged?.(loaded.data);
      } catch (caught) {
         setMessage(caught instanceof Error ? caught.message : 'Could not load webhooks.');
      }
   }, [onChanged]);

   useEffect(() => {
      if (open) void reload();
   }, [open, reload]);

   async function act(run: () => Promise<void>) {
      setMessage(undefined);
      try {
         await run();
      } catch (caught) {
         setMessage(caught instanceof Error ? caught.message : 'The webhook request failed.');
      }
   }

   return (
      <Dialog open={open} onOpenChange={onOpenChange}>
         <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
               <DialogTitle>Webhooks</DialogTitle>
               <DialogDescription>
                  Post signed JSON events to another system. Verify each request with the{' '}
                  <code>X-Flowie-Signature</code> header: <code>sha256=</code> HMAC-SHA256 of the raw
                  body with the webhook secret.
               </DialogDescription>
            </DialogHeader>
            {secret && (
               <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3" data-testid="webhook-secret">
                  <p className="text-sm font-medium">Secret for {secret.name}: copy it now, it is not shown again.</p>
                  <div className="flex gap-2">
                     <Input readOnly value={secret.value} className="font-mono text-xs" aria-label="Webhook secret" />
                     <Button
                        type="button"
                        variant="outline"
                        onClick={() => void navigator.clipboard?.writeText(secret.value)}
                     >
                        Copy
                     </Button>
                     <Button type="button" variant="ghost" onClick={() => setSecret(undefined)}>
                        Done
                     </Button>
                  </div>
               </div>
            )}
            {message && <p className="text-sm text-muted-foreground">{message}</p>}
            <ul className="space-y-2">
               {webhooks.map((webhook) => (
                  <li key={webhook.id} className="space-y-2 rounded-md border p-3" data-testid="webhook-row">
                     <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                           <p className="text-sm font-medium">
                              {webhook.name}{' '}
                              <span className={webhook.enabled ? 'text-xs text-emerald-600' : 'text-xs text-muted-foreground'}>
                                 {webhook.enabled ? 'Active' : 'Off'}
                              </span>
                           </p>
                           <p className="truncate text-xs text-muted-foreground">{webhook.url}</p>
                           <p className="text-xs text-muted-foreground">{webhook.events.join(', ')}</p>
                           {webhook.disabledReason && (
                              <p className="text-xs text-destructive">{webhook.disabledReason}</p>
                           )}
                           {webhook.lastDelivery && (
                              <p className="text-xs text-muted-foreground">
                                 Last: {webhook.lastDelivery.event} · {deliverySummary(webhook.lastDelivery)}
                              </p>
                           )}
                        </div>
                        <div className="flex flex-wrap gap-1">
                           <Button
                              size="xs"
                              variant="ghost"
                              onClick={() =>
                                 void act(async () => {
                                    const ping = await call<WebhookDelivery | null>(`/${webhook.id}/test`, {
                                       method: 'POST',
                                    });
                                    setMessage(ping ? `Test ping: ${deliverySummary(ping)}` : 'Test ping queued.');
                                    await reload();
                                 })
                              }
                           >
                              Send test
                           </Button>
                           <Button
                              size="xs"
                              variant="ghost"
                              onClick={() =>
                                 void act(async () => {
                                    const items = await call<WebhookDelivery[]>(`/${webhook.id}/deliveries`);
                                    setDeliveries(deliveries?.id === webhook.id ? undefined : { id: webhook.id, items });
                                 })
                              }
                           >
                              Deliveries
                           </Button>
                           <Button
                              size="xs"
                              variant="ghost"
                              onClick={() =>
                                 setDraft({
                                    id: webhook.id,
                                    name: webhook.name,
                                    url: webhook.url,
                                    events: webhook.events,
                                    enabled: webhook.enabled,
                                 })
                              }
                           >
                              Edit
                           </Button>
                           <Button
                              size="xs"
                              variant="ghost"
                              onClick={() => {
                                 if (!window.confirm(`Replace the secret of ${webhook.name}? The receiver must switch to the new one.`)) return;
                                 void act(async () => {
                                    const rotated = await call<{ secret: string }>(`/${webhook.id}/rotate-secret`, {
                                       method: 'POST',
                                    });
                                    setSecret({ name: webhook.name, value: rotated.secret });
                                 });
                              }}
                           >
                              Rotate secret
                           </Button>
                           <Button
                              size="xs"
                              variant="ghost"
                              className="text-destructive"
                              onClick={() => {
                                 if (!window.confirm(`Delete the webhook ${webhook.name} and its delivery log?`)) return;
                                 void act(async () => {
                                    await call(`/${webhook.id}`, { method: 'DELETE' });
                                    await reload();
                                 });
                              }}
                           >
                              Delete
                           </Button>
                        </div>
                     </div>
                     {deliveries?.id === webhook.id && (
                        <ul className="space-y-1 border-t pt-2 text-xs" data-testid="webhook-deliveries">
                           {deliveries.items.length === 0 && (
                              <li className="text-muted-foreground">No deliveries yet.</li>
                           )}
                           {deliveries.items.map((item) => (
                              <li key={item.id} className="flex flex-wrap justify-between gap-2">
                                 <span>
                                    <code>{item.event}</code> · {deliverySummary(item)}
                                    {item.durationMs !== null && ` · ${item.durationMs} ms`} · attempt {item.attempts}
                                 </span>
                                 <span className="text-muted-foreground">
                                    {new Date(item.createdAt).toLocaleString()}
                                 </span>
                              </li>
                           ))}
                        </ul>
                     )}
                  </li>
               ))}
               {webhooks.length === 0 && !draft && (
                  <li className="text-sm text-muted-foreground">No webhooks yet.</li>
               )}
            </ul>
            {draft ? (
               <WebhookForm
                  key={draft.id ?? 'new'}
                  draft={draft}
                  events={events}
                  onCancel={() => setDraft(undefined)}
                  onSaved={(saved) => {
                     setDraft(undefined);
                     if (saved.secret) setSecret({ name: saved.name, value: saved.secret });
                     void reload();
                  }}
               />
            ) : (
               <div>
                  <Button
                     type="button"
                     onClick={() => setDraft({ name: '', url: '', events: [...events], enabled: true })}
                  >
                     Add webhook
                  </Button>
               </div>
            )}
         </DialogContent>
      </Dialog>
   );
}
