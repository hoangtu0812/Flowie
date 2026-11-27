'use client';

import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@astryxdesign/core/Button';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { HStack, Layout, LayoutContent, LayoutFooter, VStack } from '@astryxdesign/core/Layout';
import { Selector } from '@astryxdesign/core/Selector';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { useMessages } from '@/features/shared/use-messages';
import {
   createSandboxSession,
   loadSandboxConversations,
   loadSandboxDirs,
   type SandboxAgent,
   type SandboxConversation,
} from '@/lib/sandbox';
import { messages } from './messages.vi';
import { shortDir } from './session-list';

const NAME = /^[A-Za-z0-9_-]{1,40}$/;

/** A session name from the folder and agent, kept to what tmux and Flowie accept. */
/** VI: Tên phiên từ thư mục và agent, chỉ gồm ký tự tmux và Flowie chấp nhận. */
export function sessionName(dir: string, agent: string, taken: string[]): string {
   const folder = dir.split('/').filter(Boolean).pop() ?? 'home';
   const base = `${folder}-${agent}`.replace(/[^A-Za-z0-9_-]+/g, '-').slice(0, 36);
   let name = base;
   for (let n = 2; taken.includes(name); n += 1) name = `${base}-${n}`;
   return name;
}

/**
 * New session, as termi's: an agent (Claude Code, Codex or a plain shell), a folder from the
 * sandbox's recent ones, and optionally one of the agent's past conversations in that folder.
 * VI: Phiên mới, như của termi: một agent (Claude Code, Codex hoặc shell thường), một thư mục
 * VI: trong các thư mục gần đây của sandbox, và có thể chọn một hội thoại cũ của agent ở đó.
 */
export function NewSessionDialog({
   taken,
   onCreated,
   onCancel,
}: {
   taken: string[];
   onCreated: (name: string) => void;
   onCancel: () => void;
}) {
   const tx = useMessages(messages);
   const [dirs, setDirs] = useState<{ home: string; recent: string[] } | null>(null);
   const [agent, setAgent] = useState<SandboxAgent | 'shell'>('claude');
   const [dir, setDir] = useState('');
   const [name, setName] = useState('');
   const [named, setNamed] = useState(false);
   const [resume, setResume] = useState('');
   const [conversations, setConversations] = useState<SandboxConversation[]>([]);
   const [busy, setBusy] = useState(false);
   const [error, setError] = useState('');

   useEffect(() => {
      loadSandboxDirs().then(
         (found) => {
            setDirs(found);
            setDir(found.recent[0] ?? found.home);
         },
         (failure: Error) => setError(failure.message)
      );
   }, []);

   useEffect(() => {
      if (!named && dir) setName(sessionName(dir, agent, taken));
   }, [dir, agent, named, taken]);

   useEffect(() => {
      setResume('');
      if (!dir || agent === 'shell') return setConversations([]);
      let current = true;
      loadSandboxConversations(dir).then(
         (found) => current && setConversations(found.filter((item) => item.agent === agent)),
         () => current && setConversations([])
      );
      return () => {
         current = false;
      };
   }, [dir, agent]);

   const folders = dirs ? [dirs.home, ...dirs.recent.filter((item) => item !== dirs.home)] : [];

   const create = async () => {
      setBusy(true);
      setError('');
      try {
         const created = await createSandboxSession({
            name,
            dir,
            agent: agent === 'shell' ? null : agent,
            ...(resume ? { resume } : {}),
         });
         onCreated(created);
      } catch (failure) {
         setError(failure instanceof Error ? failure.message : String(failure));
      } finally {
         setBusy(false);
      }
   };

   return (
      <Dialog
         isOpen
         aria-label={tx('New session')}
         purpose="form"
         width={560}
         onOpenChange={(open) => {
            if (!open && !busy) onCancel();
         }}
      >
         <Layout
            height="auto"
            padding={4}
            header={
               <DialogHeader title={tx('New session')} onOpenChange={() => !busy && onCancel()} />
            }
            footer={
               <LayoutFooter>
                  <HStack gap={2} hAlign="end">
                     <Button label={tx('Cancel')} variant="ghost" onClick={onCancel} />
                     <Button
                        label={tx('Create session')}
                        variant="primary"
                        icon={<Plus className="size-4" />}
                        isLoading={busy}
                        isDisabled={!dir || !NAME.test(name) || taken.includes(name)}
                        onClick={() => void create()}
                     />
                  </HStack>
               </LayoutFooter>
            }
         >
            <LayoutContent>
               <VStack gap={4}>
                  <Selector
                     label={tx('Agent')}
                     value={agent}
                     width="100%"
                     options={[
                        { value: 'claude', label: 'Claude Code' },
                        { value: 'codex', label: 'Codex' },
                        { value: 'shell', label: tx('Shell only') },
                     ]}
                     onChange={(value) => setAgent(value as SandboxAgent | 'shell')}
                  />
                  <Selector
                     label={tx('Folder')}
                     value={dir}
                     width="100%"
                     options={folders.map((item) => ({
                        value: item,
                        label: shortDir(item, dirs?.home ?? ''),
                     }))}
                     onChange={setDir}
                  />
                  {conversations.length > 0 && (
                     <Selector
                        label={tx('Conversation')}
                        value={resume}
                        width="100%"
                        options={[
                           { value: '', label: tx('Start a new conversation') },
                           ...conversations.map((item) => ({
                              value: item.id,
                              label: item.title || item.id,
                           })),
                        ]}
                        onChange={setResume}
                     />
                  )}
                  <TextInput
                     label={tx('Session name')}
                     value={name}
                     width="100%"
                     onChange={(value) => {
                        setNamed(true);
                        setName(value);
                     }}
                  />
                  {name && !NAME.test(name) && (
                     <Text type="supporting">{tx('Letters, digits, - and _ only, up to 40.')}</Text>
                  )}
                  {taken.includes(name) && (
                     <Text type="supporting">{tx('A session with this name exists.')}</Text>
                  )}
                  {error && (
                     <Text type="supporting" role="alert">
                        {error}
                     </Text>
                  )}
               </VStack>
            </LayoutContent>
         </Layout>
      </Dialog>
   );
}
