'use client';

import { InlineText } from '@/components/common/issues/details/content-blocks';
import { Button } from '@/components/ui/button';
import { authenticatedFetch, loadCurrentWorkspace, WorkspaceSummary } from '@/lib/workspaces';
import { useAgentChatStore } from '@/store/agent-chat-store';
import { ArrowUp, Bot, CheckCircle2, FileText, LoaderCircle, Paperclip, X } from 'lucide-react';
import { ChangeEvent, useEffect, useRef, useState } from 'react';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

type AgentProject = {
   identifier: string;
   name: string;
   description?: string | null;
   teamId?: string | null;
   startDate?: string | null;
   targetDate?: string | null;
};

type AgentIssue = {
   key: string;
   title: string;
   description?: string | null;
   teamId: string;
   projectIdentifier?: string | null;
   priority: string;
   dueDate?: string | null;
};

type AgentProposal = {
   summary: string;
   requiresClarification: boolean;
   questions: string[];
   projects: AgentProject[];
   issues: AgentIssue[];
};

type AgentMessage = {
   id: string;
   role: 'user' | 'assistant';
   content: string;
   proposal?: AgentProposal | null;
   acceptedAt?: string | null;
   appliedAt?: string | null;
   appliedResult?: { projects: Record<string, string>; issues: Record<string, string> } | null;
   createdAt: string;
};

type ConversationSummary = {
   id: string;
   title: string;
   createdAt: string;
   updatedAt: string;
};

type Conversation = ConversationSummary & {
   id: string;
   title: string;
   messages: AgentMessage[];
};

type Team = { id: string; name: string; identifier: string };

const EXAMPLES = [
   'Create a project for improving the customer onboarding experience, with implementation issues.',
   'Read the attached document and draft the related backlog issues.',
   'Break this delivery goal into a project plan with dates and owners to confirm.',
];

function MessageText({ content }: { content: string }) {
   return (
      <div className="text-sm leading-relaxed whitespace-pre-wrap">
         <InlineText text={content} />
      </div>
   );
}

function DraftPlan({
   message,
   teamNames,
   accepting,
   onAccept,
}: {
   message: AgentMessage;
   teamNames: Record<string, string>;
   accepting: boolean;
   onAccept: () => void;
}) {
   const proposal = message.proposal;
   if (!proposal) return null;
   const accepted = Boolean(message.appliedAt);

   return (
      <div className="mt-3 rounded-lg border bg-container overflow-hidden">
         <div className="flex items-center justify-between gap-3 border-b px-3 py-2.5">
            <div>
               <p className="text-sm font-medium">Proposed plan</p>
               <p className="text-xs text-muted-foreground">
                  Review every item. Nothing is created until you accept this plan.
               </p>
            </div>
            {accepted ? (
               <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                  <CheckCircle2 className="size-4" /> Applied
               </span>
            ) : (
               <Button
                  size="sm"
                  onClick={onAccept}
                  disabled={accepting || proposal.requiresClarification}
               >
                  {accepting ? (
                     <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                     <CheckCircle2 className="size-4" />
                  )}
                  Accept plan
               </Button>
            )}
         </div>
         <div className="p-3 space-y-4">
            {proposal.requiresClarification && (
               <div className="rounded-md bg-amber-500/10 px-3 py-2 text-sm">
                  Answer the questions below or send a follow-up message before accepting.
               </div>
            )}
            {proposal.questions.length > 0 && (
               <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                     Needs confirmation
                  </p>
                  <ul className="mt-1.5 space-y-1 text-sm list-disc pl-5">
                     {proposal.questions.map((question) => (
                        <li key={question}>{question}</li>
                     ))}
                  </ul>
               </div>
            )}
            {proposal.projects.length > 0 && (
               <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                     Projects
                  </p>
                  <div className="mt-1.5 space-y-2">
                     {proposal.projects.map((project) => (
                        <div
                           key={project.identifier}
                           className="rounded-md border px-3 py-2 text-sm"
                        >
                           <p className="font-medium">
                              {project.name}{' '}
                              <span className="text-muted-foreground font-normal">
                                 {project.identifier}
                              </span>
                           </p>
                           {project.description && (
                              <p className="mt-1 text-muted-foreground">{project.description}</p>
                           )}
                           <p className="mt-1.5 text-xs text-muted-foreground">
                              {project.teamId
                                 ? (teamNames[project.teamId] ?? 'Workspace team')
                                 : 'No team'}{' '}
                              · {project.startDate ?? 'No start date'} →{' '}
                              {project.targetDate ?? 'No target date'}
                           </p>
                        </div>
                     ))}
                  </div>
               </div>
            )}
            {proposal.issues.length > 0 && (
               <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                     Issues
                  </p>
                  <div className="mt-1.5 space-y-2">
                     {proposal.issues.map((issue) => (
                        <div key={issue.key} className="rounded-md border px-3 py-2 text-sm">
                           <p className="font-medium">{issue.title}</p>
                           {issue.description && (
                              <p className="mt-1 text-muted-foreground">{issue.description}</p>
                           )}
                           <p className="mt-1.5 text-xs text-muted-foreground">
                              {teamNames[issue.teamId] ?? 'Workspace team'} · {issue.priority}{' '}
                              priority · {issue.projectIdentifier ?? 'No project'} · due{' '}
                              {issue.dueDate ?? 'not set'}
                           </p>
                        </div>
                     ))}
                  </div>
               </div>
            )}
         </div>
      </div>
   );
}

function ChatComposer({
   onSend,
   pending,
}: {
   onSend: (message: string, files: File[]) => void;
   pending: boolean;
}) {
   const [value, setValue] = useState('');
   const [files, setFiles] = useState<File[]>([]);
   const inputRef = useRef<HTMLInputElement>(null);
   const submit = () => {
      if (!value.trim() || pending) return;
      onSend(value.trim(), files);
      setValue('');
      setFiles([]);
      if (inputRef.current) inputRef.current.value = '';
   };
   const addFiles = (event: ChangeEvent<HTMLInputElement>) => {
      const incoming = Array.from(event.target.files ?? []);
      setFiles((current) => [...current, ...incoming].slice(0, 5));
   };

   return (
      <div className="w-full border rounded-xl bg-container shadow-xs">
         {files.length > 0 && (
            <div className="flex flex-wrap gap-2 px-3 pt-3">
               {files.map((file) => (
                  <span
                     key={`${file.name}-${file.lastModified}`}
                     className="inline-flex items-center gap-1 rounded-md bg-accent px-2 py-1 text-xs"
                  >
                     <FileText className="size-3" /> {file.name}
                     <button
                        type="button"
                        onClick={() =>
                           setFiles((current) => current.filter((item) => item !== file))
                        }
                        aria-label={`Remove ${file.name}`}
                     >
                        <X className="size-3" />
                     </button>
                  </span>
               ))}
            </div>
         )}
         <textarea
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
               if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  submit();
               }
            }}
            placeholder="Describe the project or issues you want to plan…"
            disabled={pending}
            className="w-full min-h-16 resize-none bg-transparent px-4 pt-3.5 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
         />
         <div className="flex items-center justify-between px-2.5 pb-2.5">
            <div>
               <input
                  ref={inputRef}
                  className="hidden"
                  type="file"
                  multiple
                  accept=".md,.markdown,.docx,.xlsx"
                  onChange={addFiles}
               />
               <Button
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() => inputRef.current?.click()}
               >
                  <Paperclip className="size-4" /> Attach source
               </Button>
            </div>
            <Button
               size="icon"
               className="size-7 rounded-full"
               onClick={submit}
               disabled={!value.trim() || pending}
               aria-label="Generate plan"
            >
               {pending ? (
                  <LoaderCircle className="size-4 animate-spin" />
               ) : (
                  <ArrowUp className="size-4" />
               )}
            </Button>
         </div>
      </div>
   );
}

export default function AgentChat() {
   const { conversations, activeConversationId, setConversations, setActiveConversation } =
      useAgentChatStore();
   const [workspace, setWorkspace] = useState<WorkspaceSummary | null>(null);
   const [messages, setMessages] = useState<AgentMessage[]>([]);
   const [teamNames, setTeamNames] = useState<Record<string, string>>({});
   const [loading, setLoading] = useState(true);
   const [pending, setPending] = useState(false);
   const [accepting, setAccepting] = useState<string | null>(null);
   const [error, setError] = useState<string | null>(null);
   const scrollRef = useRef<HTMLDivElement>(null);

   useEffect(() => {
      let active = true;
      void (async () => {
         try {
            const currentWorkspace = await loadCurrentWorkspace();
            const [conversationResponse, teamResponse] = await Promise.all([
               authenticatedFetch(`${api}/agent/conversations?workspaceId=${currentWorkspace.id}`),
               authenticatedFetch(`${api}/teams?workspaceId=${currentWorkspace.id}`),
            ]);
            if (!conversationResponse.ok) throw new Error('Could not load Agent conversations.');
            const conversationPayload = (await conversationResponse.json()) as {
               data: ConversationSummary[];
            };
            const teamPayload = teamResponse.ok
               ? ((await teamResponse.json()) as { data: Team[] })
               : { data: [] };
            if (!active) return;
            setWorkspace(currentWorkspace);
            setConversations(conversationPayload.data);
            setTeamNames(Object.fromEntries(teamPayload.data.map((team) => [team.id, team.name])));
         } catch (cause) {
            if (active) setError(cause instanceof Error ? cause.message : 'Could not load Agent.');
         } finally {
            if (active) setLoading(false);
         }
      })();
      return () => {
         active = false;
      };
   }, [setConversations]);

   useEffect(() => {
      if (!workspace || !activeConversationId) {
         setMessages([]);
         return;
      }
      let active = true;
      setLoading(true);
      void (async () => {
         try {
            const response = await authenticatedFetch(
               `${api}/agent/conversations/${activeConversationId}?workspaceId=${workspace.id}`
            );
            if (!response.ok) throw new Error('Could not load this Agent conversation.');
            const payload = (await response.json()) as { data: Conversation };
            if (active) setMessages(payload.data.messages);
         } catch (cause) {
            if (active)
               setError(
                  cause instanceof Error ? cause.message : 'Could not load this conversation.'
               );
         } finally {
            if (active) setLoading(false);
         }
      })();
      return () => {
         active = false;
      };
   }, [activeConversationId, workspace]);

   useEffect(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
   }, [messages, pending]);

   const send = async (content: string, files: File[]) => {
      if (!workspace) return;
      setPending(true);
      setError(null);
      const optimistic: AgentMessage = {
         id: `pending-${Date.now()}`,
         role: 'user',
         content,
         createdAt: new Date().toISOString(),
      };
      setMessages((current) => [...current, optimistic]);
      try {
         const body = new FormData();
         body.append('workspaceId', workspace.id);
         body.append('message', content);
         if (activeConversationId) body.append('conversationId', activeConversationId);
         files.forEach((file) => body.append('files', file));
         const response = await authenticatedFetch(`${api}/agent/conversations/messages`, {
            method: 'POST',
            body,
         });
         const payload = (await response.json().catch(() => null)) as {
            data?: { conversation: { id: string; title: string }; message: AgentMessage };
            message?: string;
         } | null;
         const data = payload?.data;
         if (!response.ok || !data)
            throw new Error(payload?.message ?? 'Could not generate a plan.');
         setMessages((current) => [
            ...current.filter((item) => item.id !== optimistic.id),
            optimistic,
            data.message,
         ]);
         const updated = {
            id: data.conversation.id,
            title: data.conversation.title,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
         };
         setConversations([updated, ...conversations.filter((item) => item.id !== updated.id)]);
         setActiveConversation(updated.id);
      } catch (cause) {
         setMessages((current) => current.filter((item) => item.id !== optimistic.id));
         setError(cause instanceof Error ? cause.message : 'Could not generate a plan.');
      } finally {
         setPending(false);
      }
   };

   const accept = async (messageId: string) => {
      if (!workspace) return;
      setAccepting(messageId);
      setError(null);
      try {
         const response = await authenticatedFetch(
            `${api}/agent/messages/${messageId}/accept?workspaceId=${workspace.id}`,
            { method: 'POST' }
         );
         const payload = (await response.json().catch(() => null)) as {
            data?: AgentMessage['appliedResult'];
            message?: string;
         } | null;
         if (!response.ok) throw new Error(payload?.message ?? 'Could not apply this plan.');
         setMessages((current) =>
            current.map((item) =>
               item.id === messageId
                  ? {
                       ...item,
                       acceptedAt: new Date().toISOString(),
                       appliedAt: new Date().toISOString(),
                       appliedResult: payload?.data ?? null,
                    }
                  : item
            )
         );
      } catch (cause) {
         setError(cause instanceof Error ? cause.message : 'Could not apply this plan.');
      } finally {
         setAccepting(null);
      }
   };

   if (loading && !workspace) {
      return (
         <div className="w-full h-full grid place-items-center text-sm text-muted-foreground">
            <LoaderCircle className="size-5 animate-spin" />
         </div>
      );
   }

   return (
      <div className="w-full h-full flex flex-col overflow-hidden">
         <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto">
            {messages.length === 0 ? (
               <div className="min-h-full max-w-2xl mx-auto px-6 flex flex-col justify-center py-16">
                  <div className="flex justify-center mb-7 text-muted-foreground/35">
                     <Bot className="size-20" strokeWidth={1} />
                  </div>
                  <h1 className="text-center text-lg font-medium">Plan work with Agent</h1>
                  <p className="mt-2 text-center text-sm text-muted-foreground">
                     Draft projects and issues from a request or an attached Markdown, DOCX, or XLSX
                     file. Review the proposal before anything is created.
                  </p>
                  <div className="mt-7 grid gap-2">
                     {EXAMPLES.map((example) => (
                        <button
                           key={example}
                           type="button"
                           onClick={() => void send(example, [])}
                           disabled={pending}
                           className="rounded-lg border p-3 text-left text-sm hover:bg-accent/40 transition-colors disabled:opacity-60"
                        >
                           {example}
                        </button>
                     ))}
                  </div>
               </div>
            ) : (
               <div className="max-w-2xl mx-auto px-6 py-8 flex flex-col gap-6">
                  {messages.map((message) =>
                     message.role === 'user' ? (
                        <div key={message.id} className="flex justify-end">
                           <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-accent px-4 py-2.5 text-sm">
                              {message.content}
                           </div>
                        </div>
                     ) : (
                        <div key={message.id} className="flex items-start gap-2.5">
                           <span className="mt-0.5 inline-flex size-6 items-center justify-center rounded-full border bg-container shrink-0">
                              <Bot className="size-3.5" />
                           </span>
                           <div className="min-w-0 flex-1">
                              <MessageText content={message.content} />
                              <DraftPlan
                                 message={message}
                                 teamNames={teamNames}
                                 accepting={accepting === message.id}
                                 onAccept={() => void accept(message.id)}
                              />
                           </div>
                        </div>
                     )
                  )}
               </div>
            )}
         </div>
         <div className="shrink-0 border-t bg-container">
            <div className="max-w-2xl mx-auto px-6 py-4">
               <ChatComposer onSend={send} pending={pending} />
               {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
            </div>
         </div>
      </div>
   );
}
