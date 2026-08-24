'use client';
import { FormEvent, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { loadCurrentWorkspace } from '@/lib/workspaces';
const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
export function DiscordIntegration() {
   const [workspaceId, setWorkspaceId] = useState<string>();
   const [url, setUrl] = useState('');
   const [enabled, setEnabled] = useState(true);
   const [message, setMessage] = useState<string>();
   const [saving, setSaving] = useState(false);
   const [configured, setConfigured] = useState(false);
   useEffect(() => {
      void loadCurrentWorkspace()
         .then((workspace) => {
            const id = workspace.id;
            setWorkspaceId(id);
            return fetch(`${api}/integrations/discord?workspaceId=${id}`, {
               credentials: 'include',
            });
         })
         .then(async (r) => {
            if (!r?.ok) return;
            const p = (await r.json()) as {
               data: { webhookUrlMasked: string; enabled: boolean } | null;
            };
            if (p.data) {
               setConfigured(true);
               setEnabled(p.data.enabled);
            }
         })
         .catch(() => setMessage('Không thể tải cấu hình Discord.'));
   }, []);
   async function save(event: FormEvent) {
      event.preventDefault();
      if (!workspaceId) return;
      setSaving(true);
      setMessage(undefined);
      const r = await fetch(`${api}/integrations/discord?workspaceId=${workspaceId}`, {
         method: 'POST',
         credentials: 'include',
         headers: { 'content-type': 'application/json' },
         body: JSON.stringify({ webhookUrl: url, enabled }),
      });
      setSaving(false);
      setMessage(r.ok ? 'Đã lưu cấu hình Discord.' : 'Không thể lưu. Hãy kiểm tra webhook URL.');
   }
   async function test() {
      if (!workspaceId) return;
      const r = await fetch(`${api}/integrations/discord/test?workspaceId=${workspaceId}`, {
         method: 'POST',
         credentials: 'include',
      });
      const p = (await r.json()) as { data?: { delivered: boolean } };
      setMessage(
         r.ok && p.data?.delivered
            ? 'Đã gửi thông báo thử đến Discord.'
            : 'Gửi thử không thành công. Hãy kiểm tra webhook URL.'
      );
   }
   return (
      <section className="mx-auto w-full max-w-2xl p-6">
         <h1 className="text-xl font-semibold">Discord</h1>
         <p className="mt-1 text-sm text-muted-foreground">
            Nhận thông báo khi tạo issue hoặc project. Email, Slack và desktop app hiện không được
            kích hoạt.
         </p>
         <form className="mt-6 space-y-4 rounded-lg border bg-card p-5" onSubmit={save}>
            <div>
               <Label htmlFor="discord-url">Discord webhook URL</Label>
               <Input
                  id="discord-url"
                  className="mt-1"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder={
                     configured
                        ? 'Đã cấu hình — nhập URL mới để thay thế'
                        : 'https://discord.com/api/webhooks/…'
                  }
                  type="url"
               />
            </div>
            <label className="flex items-center gap-2 text-sm">
               <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
               />{' '}
               Bật gửi thông báo Discord
            </label>
            {message && <p className="text-sm text-muted-foreground">{message}</p>}
            <div className="flex gap-2">
               <Button type="submit" disabled={saving}>
                  {saving ? 'Đang lưu…' : 'Lưu cấu hình'}
               </Button>
               <Button
                  type="button"
                  variant="outline"
                  onClick={() => void test()}
                  disabled={!url && !configured}
               >
                  Gửi thử
               </Button>
            </div>
         </form>
      </section>
   );
}
