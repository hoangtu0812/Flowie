'use client';

import { LifeBuoy } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useMessages } from '@/features/shared/use-messages';
import { messages } from './messages.vi';
import { ticketForIssue } from './service-desk-api';

/**
 * Leads from an issue to the ticket it came from, where the files and the conversation with the
 * requester live. Renders nothing without a ticket or without access to it.
 * VI: Dẫn từ Issue về ticket gốc, nơi có tệp đính kèm và trao đổi với người yêu cầu. Không hiển
 * VI: thị gì khi không có ticket hoặc không có quyền xem.
 */
export function IssueTicketLink({
   workspaceId,
   issueId,
   orgId,
}: {
   workspaceId: string | undefined;
   issueId: string;
   orgId: string;
}) {
   const tx = useMessages(messages);
   const [ticket, setTicket] = useState<{ id: string; title: string } | null>(null);

   useEffect(() => {
      setTicket(null);
      if (!workspaceId) return;
      let current = true;
      ticketForIssue(workspaceId, issueId)
         .then((found) => current && setTicket(found))
         .catch(() => undefined);
      return () => {
         current = false;
      };
   }, [issueId, workspaceId]);

   if (!ticket) return null;
   return (
      <Link
         href={`/${orgId}/service-desk/${ticket.id}`}
         className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
         <LifeBuoy className="size-3.5 shrink-0" />
         <span className="truncate">
            {tx('Service Desk ticket')}: {ticket.title}
         </span>
      </Link>
   );
}
