'use client';

import { CopyButton } from '@/components/common/copy-button';
import { MarkdownPreview } from '@/components/common/markdown/markdown-preview';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { authenticatedFetch, loadCurrentWorkspace, WorkspaceSummary } from '@/lib/workspaces';
import { useAgentChatStore } from '@/store/agent-chat-store';
import {
   ArrowUp,
   Bookmark,
   Bot,
   ChevronDown,
   ChevronRight,
   Circle,
   CircleCheck,
   CircleMinus,
   FileText,
   ListChecks,
   LoaderCircle,
   Plus,
   SquareTerminal,
   X,
} from 'lucide-react';
import { ChangeEvent, useEffect, useRef, useState } from 'react';
import { ThinkingOrb, type OrbState } from 'thinking-orbs';

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
   kind?: 'plan';
   summary: string;
   requiresClarification: boolean;
   questions: string[];
   projects: AgentProject[];
   issues: AgentIssue[];
};

type AssignmentItem = {
   issueId: string;
   identifier: string;
   title: string;
   priority: string;
   estimatedEffort: number | null;
   labels: string[];
   suggestedUserId: string;
   suggestedUserName: string;
   reason: string;
   note: string;
};

type AssignmentProposal = {
   kind: 'assignment';
   teamId: string;
   teamName: string;
   unassignedTotal: number;
   items: AssignmentItem[];
};

type AgentMessage = {
   id: string;
   role: 'user' | 'assistant';
   content: string;
   proposal?: AgentProposal | AssignmentProposal | null;
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

type AgentProgress = {
   id: string;
   label: string;
   state: 'running' | 'completed';
   orb: OrbState;
   /** Tool arguments as JSON on a tool-call step. VI: Tham số tool dạng JSON ở bước gọi tool. */
   detail?: string;
};

type AgentFailure = { message: string; steps: AgentProgress[] };

type AgentResponse = {
   conversation: { id: string; title: string };
   userMessage: AgentMessage;
   message: AgentMessage;
};

type Team = { id: string; name: string; identifier: string };

const EXAMPLES = [
   'Create a project for improving the customer onboarding experience, with implementation issues.',
   'Read the attached document and draft the related backlog issues.',
   'Break this delivery goal into a project plan with dates and owners to confirm.',
   'How many issues are overdue?',
   'Who is overloaded? Suggest assignments for my team.',
   'How are our projects doing, and which ones need attention?',
   'Write a detailed status report for leadership.',
];

/**
 * Assistant replies are Markdown: answers and leadership reports use headings,
 * lists and tables. Raw HTML is skipped by MarkdownPreview; code blocks get a copy button.
 * VI: Câu trả lời của Agent là Markdown: câu trả lời và báo cáo lãnh đạo dùng
 * VI: tiêu đề, danh sách và bảng. MarkdownPreview bỏ qua HTML thô; code block có nút copy.
 */
function MessageText({ content }: { content: string }) {
   return (
      <div className="text-sm leading-relaxed min-w-0 overflow-x-auto">
         <MarkdownPreview content={content} appearance="chat" />
      </div>
   );
}

/** Summary row of a native disclosure, without the browser's marker. VI: Dòng tóm tắt của disclosure gốc, bỏ marker của trình duyệt. */
const SUMMARY =
   'flex w-fit max-w-full cursor-pointer list-none items-center gap-2 text-sm text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden';

/**
 * One Agent step shown as a tool call: an icon for its state, its label, and a body with the
 * step id and state, plus the tool arguments when the Q&A loop sent them in `detail`. A failed
 * step is red.
 * VI: Một bước của Agent hiển thị như một lần gọi công cụ: icon trạng thái, nhãn, và phần mở
 * VI: rộng có mã bước và trạng thái, kèm tham số tool khi vòng lặp hỏi đáp gửi trong `detail`.
 * VI: Bước bị lỗi hiện màu đỏ.
 */
function ToolStep({ step, failed = false }: { step: AgentProgress; failed?: boolean }) {
   const state = failed ? 'failed' : step.state;
   return (
      <details className="group/tool">
         <summary className={cn(SUMMARY, failed && 'text-destructive hover:text-destructive')}>
            {step.state === 'running' && !failed ? (
               <LoaderCircle className="size-4 shrink-0 animate-spin" />
            ) : (
               <SquareTerminal className="size-4 shrink-0" />
            )}
            <span className="min-w-0 truncate">
               {failed ? `Failed: ${step.label}` : step.label}
            </span>
            <ChevronRight className="size-3.5 shrink-0 transition-transform group-open/tool:rotate-90" />
         </summary>
         <div className="ml-2 mt-1.5 border-l pl-4">
            <code className="block rounded-lg bg-muted px-3 py-2 text-xs">
               {step.id} · {state}
               {step.detail && <span className="mt-1 block break-all">{step.detail}</span>}
            </code>
         </div>
      </details>
   );
}

/**
 * Chain of thought of one Agent turn. While the turn runs, the current step is shown with its
 * orb above every step so far; once the answer arrives the steps fold into a
 * "Completed N steps" line that opens again on click.
 * VI: Chuỗi suy luận của một lượt Agent. Khi đang chạy, bước hiện tại hiện kèm orb phía trên
 * VI: các bước đã có; khi có câu trả lời, các bước gọn lại thành dòng "Completed N steps",
 * VI: bấm để mở lại.
 */
function ChainOfThought({ steps, running }: { steps: AgentProgress[]; running: boolean }) {
   if (running) {
      const current = [...steps].reverse().find((step) => step.state === 'running') ?? steps.at(-1);
      return (
         <div className="space-y-2" aria-live="polite">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
               <ThinkingOrb
                  state={current?.orb ?? 'working'}
                  size={20}
                  aria-label={current?.label ?? 'Agent is preparing'}
               />
               <span>{current?.label ?? 'Agent is preparing…'}</span>
            </div>
            {steps.length > 0 && (
               <div className="ml-2 space-y-1.5 border-l pl-4">
                  {steps.map((step) => (
                     <ToolStep key={step.id} step={step} />
                  ))}
               </div>
            )}
         </div>
      );
   }
   if (steps.length === 0) return null;
   return (
      <details className="group/cot mb-3">
         <summary className={SUMMARY}>
            <CircleCheck className="size-4 shrink-0" />
            Completed {steps.length} {steps.length === 1 ? 'step' : 'steps'}
            <ChevronRight className="size-3.5 shrink-0 transition-transform group-open/cot:rotate-90" />
         </summary>
         <div className="ml-2 mt-2 space-y-1.5 border-l pl-4">
            {steps.map((step) => (
               <ToolStep key={step.id} step={step} />
            ))}
         </div>
      </details>
   );
}

/**
 * A failed Agent turn as a stack trace: a red summary with the error, opening to the full
 * message and the steps that ran; the step still running when the stream failed is marked
 * as the failure point.
 * VI: Lượt Agent bị lỗi hiển thị như stack trace: dòng tóm tắt đỏ có lỗi, mở ra xem toàn văn
 * VI: thông báo và các bước đã chạy; bước còn đang chạy khi stream lỗi được đánh dấu là điểm lỗi.
 */
function FailedTurn({ failure }: { failure: AgentFailure }) {
   return (
      <details open className="group/trace" role="alert">
         <summary className={cn(SUMMARY, 'text-destructive hover:text-destructive')}>
            <SquareTerminal className="size-4 shrink-0" />
            <span className="min-w-0 truncate">Failed: {failure.message}</span>
            <ChevronDown className="size-3.5 shrink-0 transition-transform group-open/trace:rotate-180" />
         </summary>
         <div className="ml-2 mt-2 space-y-2 border-l pl-4">
            <p className="whitespace-pre-wrap break-words font-mono text-xs text-destructive">
               {failure.message}
            </p>
            {failure.steps.map((step) => (
               <ToolStep key={step.id} step={step} failed={step.state === 'running'} />
            ))}
         </div>
      </details>
   );
}

type PlanItemState = 'pending' | 'running' | 'done' | 'skipped';

/**
 * One row of a plan: a state icon, the item text and optional row actions. Done and skipped
 * rows are muted so the remaining work stands out.
 * VI: Một dòng của kế hoạch: icon trạng thái, nội dung và thao tác của dòng (nếu có). Dòng đã
 * VI: xong hoặc bỏ qua được làm mờ để phần việc còn lại nổi bật.
 */
function PlanItem({
   state,
   title,
   detail,
   meta,
   actions,
}: {
   state: PlanItemState;
   title: React.ReactNode;
   detail?: string | null;
   meta: React.ReactNode;
   actions?: React.ReactNode;
}) {
   const Icon =
      state === 'done'
         ? CircleCheck
         : state === 'running'
           ? LoaderCircle
           : state === 'skipped'
             ? CircleMinus
             : Circle;
   return (
      <li className="flex items-start gap-2.5 text-sm">
         <Icon
            className={cn(
               'mt-0.5 size-4 shrink-0 text-muted-foreground',
               state === 'running' && 'animate-spin',
               state === 'done' && 'text-emerald-600'
            )}
            aria-label={state}
         />
         <div className="min-w-0 flex-1">
            <p
               className={cn(
                  'font-medium',
                  (state === 'done' || state === 'skipped') && 'text-muted-foreground'
               )}
            >
               {title}
            </p>
            {detail && <p className="mt-0.5 text-muted-foreground">{detail}</p>}
            <p className="mt-0.5 text-xs text-muted-foreground">{meta}</p>
         </div>
         {actions}
      </li>
   );
}

/**
 * Collapsible plan card: "title · N of M <verb>" opens to the rows. It starts open because
 * a plan is the thing the person has to review.
 * VI: Thẻ kế hoạch thu gọn được: "tiêu đề · N of M <động từ>" mở ra các dòng. Mặc định mở vì
 * VI: kế hoạch là thứ người dùng phải duyệt.
 */
function PlanCard({
   title,
   progress,
   children,
   footer,
}: {
   title: string;
   progress: string;
   children: React.ReactNode;
   footer?: React.ReactNode;
}) {
   return (
      <div className="mt-3 space-y-3">
         <details open className="group/plan">
            <summary className={SUMMARY}>
               <ListChecks className="size-4 shrink-0" />
               <span className="min-w-0 truncate text-foreground">{title}</span>
               <span className="shrink-0">{progress}</span>
               <ChevronDown className="size-3.5 shrink-0 transition-transform group-open/plan:rotate-180" />
            </summary>
            <div className="ml-2 mt-2.5 space-y-4 border-l pl-4">{children}</div>
         </details>
         {footer}
      </div>
   );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
   return (
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
         {children}
      </p>
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
   if (
      !proposal ||
      proposal.kind === 'assignment' ||
      (proposal.projects.length === 0 && proposal.issues.length === 0)
   )
      return null;
   const accepted = Boolean(message.appliedAt);
   const total = proposal.projects.length + proposal.issues.length;
   const state: PlanItemState = accepted ? 'done' : accepting ? 'running' : 'pending';

   return (
      <PlanCard
         title="Plan: proposed projects and issues"
         progress={`${accepted ? total : 0} of ${total} created`}
         footer={
            accepted ? null : (
               <div className="flex flex-wrap items-center gap-3">
                  <Button
                     size="sm"
                     className="rounded-full"
                     onClick={onAccept}
                     disabled={accepting || proposal.requiresClarification}
                  >
                     {accepting ? (
                        <LoaderCircle className="size-4 animate-spin" />
                     ) : (
                        <CircleCheck className="size-4" />
                     )}
                     Accept plan
                  </Button>
                  <span className="text-xs text-muted-foreground">
                     Review every item. Nothing is created until you accept this plan.
                  </span>
               </div>
            )
         }
      >
         {proposal.requiresClarification && (
            <div className="rounded-md bg-amber-500/10 px-3 py-2 text-sm">
               Answer the questions below or send a follow-up message before accepting.
            </div>
         )}
         {proposal.questions.length > 0 && (
            <div>
               <SectionLabel>Needs confirmation</SectionLabel>
               <ul className="mt-1.5 space-y-1 text-sm list-disc pl-5">
                  {proposal.questions.map((question) => (
                     <li key={question}>{question}</li>
                  ))}
               </ul>
            </div>
         )}
         {proposal.projects.length > 0 && (
            <div>
               <SectionLabel>Projects</SectionLabel>
               <ul className="mt-2 space-y-2.5">
                  {proposal.projects.map((project) => (
                     <PlanItem
                        key={project.identifier}
                        state={state}
                        title={
                           <>
                              {project.name}{' '}
                              <span className="text-muted-foreground font-normal">
                                 {project.identifier}
                              </span>
                           </>
                        }
                        detail={project.description}
                        meta={
                           <>
                              {project.teamId
                                 ? (teamNames[project.teamId] ?? 'Workspace team')
                                 : 'No team'}{' '}
                              · {project.startDate ?? 'No start date'} →{' '}
                              {project.targetDate ?? 'No target date'}
                           </>
                        }
                     />
                  ))}
               </ul>
            </div>
         )}
         {proposal.issues.length > 0 && (
            <div>
               <SectionLabel>Issues</SectionLabel>
               <ul className="mt-2 space-y-2.5">
                  {proposal.issues.map((issue) => (
                     <PlanItem
                        key={issue.key}
                        state={state}
                        title={issue.title}
                        detail={issue.description}
                        meta={
                           <>
                              {teamNames[issue.teamId] ?? 'Workspace team'} · {issue.priority}{' '}
                              priority · {issue.projectIdentifier ?? 'No project'} · due{' '}
                              {issue.dueDate ?? 'not set'}
                           </>
                        }
                     />
                  ))}
               </ul>
            </div>
         )}
      </PlanCard>
   );
}

function AssignmentPlan({
   message,
   applyingId,
   appliedIds,
   skippedIds,
   onApply,
   onSkip,
}: {
   message: AgentMessage;
   applyingId: string | null;
   appliedIds: Set<string>;
   skippedIds: Set<string>;
   onApply: (item: AssignmentItem) => void;
   onSkip: (issueId: string) => void;
}) {
   const proposal = message.proposal;
   if (!proposal || proposal.kind !== 'assignment' || proposal.items.length === 0) return null;
   const remaining = proposal.items.filter(
      (item) => !appliedIds.has(item.issueId) && !skippedIds.has(item.issueId)
   );

   return (
      <PlanCard
         title={`Suggested assignments · ${proposal.teamName}`}
         progress={`${appliedIds.size} of ${proposal.items.length} applied`}
         footer={
            <p className="text-xs text-muted-foreground">
               {remaining.length === 0
                  ? 'All rows resolved.'
                  : 'Nothing is assigned until you apply a row.'}
            </p>
         }
      >
         <ul className="space-y-2.5">
            {proposal.items.map((item) => {
               const applied = appliedIds.has(item.issueId);
               const skipped = skippedIds.has(item.issueId);
               return (
                  <PlanItem
                     key={item.issueId}
                     state={
                        applied
                           ? 'done'
                           : skipped
                             ? 'skipped'
                             : applyingId === item.issueId
                               ? 'running'
                               : 'pending'
                     }
                     title={
                        <>
                           <span className="text-muted-foreground font-normal mr-1.5">
                              {item.identifier}
                           </span>
                           {item.title}
                        </>
                     }
                     meta={
                        <>
                           → {item.suggestedUserName} · {item.note}
                        </>
                     }
                     actions={
                        applied ? (
                           <span className="text-xs text-emerald-600 shrink-0">Applied</span>
                        ) : skipped ? (
                           <span className="text-xs text-muted-foreground shrink-0">Skipped</span>
                        ) : (
                           <div className="flex items-center gap-1.5 shrink-0">
                              <Button
                                 size="xs"
                                 variant="ghost"
                                 onClick={() => onSkip(item.issueId)}
                              >
                                 Skip
                              </Button>
                              <Button
                                 size="xs"
                                 variant="outline"
                                 className="rounded-full"
                                 disabled={applyingId === item.issueId}
                                 onClick={() => onApply(item)}
                              >
                                 Apply
                              </Button>
                           </div>
                        )
                     }
                  />
               );
            })}
         </ul>
      </PlanCard>
   );
}

/**
 * Checkpoint between turns: a labelled rule after a plan that was applied, the one point in
 * an Agent conversation where workspace data changed. Flowie cannot undo an applied plan, so
 * unlike the AI Elements checkpoint it has no Restore action.
 * VI: Checkpoint giữa các lượt: vạch có nhãn sau một kế hoạch đã áp dụng, điểm duy nhất trong
 * VI: hội thoại Agent làm thay đổi dữ liệu workspace. Flowie không hoàn tác được kế hoạch đã áp
 * VI: dụng nên khác checkpoint của AI Elements, không có nút Restore.
 */
function Checkpoint({ label }: { label: string }) {
   return (
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
         <span className="h-px flex-1 bg-border" />
         <Bookmark className="size-3.5" />
         {label}
         <span className="h-px flex-1 bg-border" />
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
      <div className="w-full rounded-3xl bg-muted">
         {files.length > 0 && (
            <div className="flex flex-wrap gap-2 px-4 pt-3">
               {files.map((file) => (
                  <span
                     key={`${file.name}-${file.lastModified}`}
                     className="inline-flex items-center gap-1 rounded-full border bg-background px-2.5 py-1 text-xs"
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
               if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  submit();
               }
            }}
            placeholder="Ask about your work or describe a project and issues to plan…"
            aria-label="Message Agent"
            disabled={pending}
            className="w-full min-h-16 resize-none bg-transparent px-5 pt-4 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
         />
         <div className="flex items-center justify-between px-3 pb-3">
            <input
               ref={inputRef}
               className="hidden"
               type="file"
               multiple
               accept=".md,.markdown,.docx,.xlsx"
               onChange={addFiles}
            />
            <Button
               variant="outline"
               size="icon"
               className="size-8 rounded-full"
               disabled={pending}
               onClick={() => inputRef.current?.click()}
               aria-label="Attach source"
               title="Attach a Markdown, DOCX or XLSX source"
            >
               <Plus className="size-4" />
            </Button>
            <Button
               size="icon"
               className="size-8 rounded-full"
               onClick={submit}
               disabled={!value.trim() || pending}
               aria-label="Send message"
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
   const [progress, setProgress] = useState<AgentProgress[]>([]);
   const [accepting, setAccepting] = useState<string | null>(null);
   const [applyingId, setApplyingId] = useState<string | null>(null);
   const [resolved, setResolved] = useState<
      Record<string, { applied: string[]; skipped: string[] }>
   >({});
   const [error, setError] = useState<string | null>(null);
   // Steps of each turn run in this browser session, keyed by the assistant message id; the
   // API does not store them, so a reloaded conversation shows answers without steps.
   // VI: Các bước của mỗi lượt chạy trong phiên trình duyệt này, theo id tin trả lời; API không
   // VI: lưu chúng nên hội thoại tải lại chỉ có câu trả lời, không có các bước.
   const [stepsByMessage, setStepsByMessage] = useState<Record<string, AgentProgress[]>>({});
   const [failure, setFailure] = useState<AgentFailure | null>(null);
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
      setFailure(null);
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
   }, [messages, pending, progress, failure]);

   const send = async (content: string, files: File[]) => {
      if (!workspace) return;
      setPending(true);
      setProgress([]);
      setError(null);
      setFailure(null);
      let steps: AgentProgress[] = [];
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
         const response = await authenticatedFetch(`${api}/agent/conversations/messages/stream`, {
            method: 'POST',
            body,
         });
         if (!response.ok) {
            const payload = (await response.json().catch(() => null)) as {
               message?: string;
            } | null;
            throw new Error(payload?.message ?? 'Could not start the Agent response.');
         }
         if (!response.body) throw new Error('The Agent response stream was unavailable.');

         const reader = response.body.getReader();
         const decoder = new TextDecoder();
         let buffer = '';
         let data: AgentResponse | null = null;
         while (true) {
            const { done, value } = await reader.read();
            buffer += decoder.decode(value, { stream: !done });
            let separator = buffer.indexOf('\n\n');
            while (separator !== -1) {
               const frame = buffer.slice(0, separator);
               buffer = buffer.slice(separator + 2);
               separator = buffer.indexOf('\n\n');
               const event = frame.match(/^event: (.+)$/m)?.[1];
               const raw = frame.match(/^data: (.+)$/m)?.[1];
               if (!event || !raw) continue;
               const payload = JSON.parse(raw) as
                  AgentProgress | AgentResponse | { message: string };
               if (event === 'progress') {
                  const step = payload as AgentProgress;
                  steps = steps.some((item) => item.id === step.id)
                     ? steps.map((item) => (item.id === step.id ? step : item))
                     : [...steps, step];
                  setProgress(steps);
               } else if (event === 'complete') {
                  data = payload as AgentResponse;
               } else if (event === 'error') {
                  throw new Error((payload as { message: string }).message);
               }
            }
            if (done) break;
         }
         if (!data) throw new Error('The Agent response ended before returning a result.');
         const answerId = data.message.id;
         setStepsByMessage((current) => ({ ...current, [answerId]: steps }));
         setMessages((current) => [
            ...current.filter((item) => item.id !== optimistic.id),
            data.userMessage,
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
         setFailure({
            message: cause instanceof Error ? cause.message : 'Could not get an Agent response.',
            steps,
         });
      } finally {
         setProgress([]);
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

   const markResolved = (messageId: string, issueId: string, kind: 'applied' | 'skipped') => {
      setResolved((current) => ({
         ...current,
         [messageId]: {
            applied: current[messageId]?.applied ?? [],
            skipped: current[messageId]?.skipped ?? [],
            [kind]: [...(current[messageId]?.[kind] ?? []), issueId],
         },
      }));
   };

   const applyAssignment = async (messageId: string, item: AssignmentItem) => {
      if (!workspace) return;
      setApplyingId(item.issueId);
      setError(null);
      try {
         const response = await authenticatedFetch(`${api}/agent/assignments/apply`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
               workspaceId: workspace.id,
               issueId: item.issueId,
               assigneeId: item.suggestedUserId,
            }),
         });
         const payload = (await response.json().catch(() => null)) as {
            data?: unknown;
            message?: string;
         } | null;
         if (!response.ok) throw new Error(payload?.message ?? 'Could not apply this assignment.');
         markResolved(messageId, item.issueId, 'applied');
      } catch (cause) {
         setError(cause instanceof Error ? cause.message : 'Could not apply this assignment.');
      } finally {
         setApplyingId(null);
      }
   };

   const skipAssignment = (messageId: string, issueId: string) => {
      markResolved(messageId, issueId, 'skipped');
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
            {messages.length === 0 && !failure ? (
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
                           className="rounded-xl border p-3 text-left text-sm hover:bg-accent/40 transition-colors disabled:opacity-60"
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
                        <div key={message.id} className="group flex flex-col items-end gap-1">
                           <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-3xl bg-muted px-4 py-2.5 text-sm">
                              {message.content}
                           </div>
                           <div className="opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                              <CopyButton text={message.content} label="Copy message" />
                           </div>
                        </div>
                     ) : (
                        <div key={message.id} className="flex flex-col gap-6">
                           <div className="min-w-0">
                              <ChainOfThought
                                 steps={stepsByMessage[message.id] ?? []}
                                 running={false}
                              />
                              <MessageText content={message.content} />
                              <DraftPlan
                                 message={message}
                                 teamNames={teamNames}
                                 accepting={accepting === message.id}
                                 onAccept={() => void accept(message.id)}
                              />
                              <AssignmentPlan
                                 message={message}
                                 applyingId={applyingId}
                                 appliedIds={new Set(resolved[message.id]?.applied ?? [])}
                                 skippedIds={new Set(resolved[message.id]?.skipped ?? [])}
                                 onApply={(item) => void applyAssignment(message.id, item)}
                                 onSkip={(issueId) => skipAssignment(message.id, issueId)}
                              />
                              <div className="mt-2 -ml-1.5 flex items-center">
                                 <CopyButton text={message.content} label="Copy answer" />
                              </div>
                           </div>
                           {message.appliedAt && <Checkpoint label="Plan applied" />}
                        </div>
                     )
                  )}
                  {pending && <ChainOfThought steps={progress} running />}
                  {failure && <FailedTurn failure={failure} />}
               </div>
            )}
         </div>
         <div className="shrink-0 bg-container">
            <div className="max-w-2xl mx-auto px-6 pb-5 pt-2">
               <ChatComposer onSend={send} pending={pending} />
               {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
            </div>
         </div>
      </div>
   );
}
