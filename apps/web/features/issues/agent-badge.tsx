'use client';

import { Bot } from 'lucide-react';
import type { AgentIdentity } from './comments-api';

/**
 * Marks a comment or activity written through an MCP connection, so work an AI agent did with
 * a person's token is not mistaken for that person typing it. Older records only know the
 * write came from MCP, so they show a generic "AI agent" name.
 * VI: Đánh dấu comment hoặc hoạt động được ghi qua MCP connection, để việc agent AI làm bằng
 * VI: token của một người không bị hiểu nhầm là chính người đó gõ. Bản ghi cũ chỉ biết là đến
 * VI: từ MCP nên hiển thị tên chung "AI agent".
 */
export function AgentBadge({ agent }: { agent: AgentIdentity }) {
   const name = agent.name || 'AI agent';
   return (
      <span
         className="inline-flex items-center gap-1 rounded-md bg-violet-500/10 px-1.5 py-0.5 text-[11px] font-medium text-violet-700 dark:text-violet-300"
         title={`Written by an AI agent through the MCP connection "${name}"`}
      >
         <Bot className="size-3" aria-hidden="true" />
         {name} · AI
      </span>
   );
}
