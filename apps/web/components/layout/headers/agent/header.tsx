'use client';

import { Button } from '@/components/ui/button';
import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuSeparator,
   DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { useAgentChatStore } from '@/store/agent-chat-store';
import { ChevronDown, MessageSquare, Plus } from 'lucide-react';

export default function Header() {
   const { conversations, activeConversationId, setActiveConversation, startNewChat } =
      useAgentChatStore();
   const activeConversation = conversations.find((chat) => chat.id === activeConversationId);

   return (
      <div className="w-full flex justify-between items-center border-b py-1.5 px-6 h-10">
         <div className="flex items-center gap-2 min-w-0">
            <SidebarTrigger />
            <DropdownMenu>
               <DropdownMenuTrigger className="flex items-center gap-1 text-sm font-medium outline-none hover:text-foreground min-w-0">
                  <span className="truncate max-w-64">
                     {activeConversation?.title ?? 'New plan'}
                  </span>
                  <ChevronDown className="size-3.5 text-muted-foreground shrink-0" />
               </DropdownMenuTrigger>
               <DropdownMenuContent align="start" className="w-64">
                  <DropdownMenuItem onClick={startNewChat}>
                     <Plus className="size-4" />
                     New plan
                  </DropdownMenuItem>
                  {conversations.length > 0 && <DropdownMenuSeparator />}
                  {conversations.map((conversation) => (
                     <DropdownMenuItem
                        key={conversation.id}
                        onClick={() => setActiveConversation(conversation.id)}
                     >
                        <MessageSquare className="size-4" />
                        <span className="truncate">{conversation.title}</span>
                     </DropdownMenuItem>
                  ))}
               </DropdownMenuContent>
            </DropdownMenu>
         </div>
         <Button size="xs" variant="ghost" onClick={startNewChat} aria-label="Start a new plan">
            <Plus className="size-4" />
         </Button>
      </div>
   );
}
