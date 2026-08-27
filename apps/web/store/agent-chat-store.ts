import { create } from 'zustand';

export interface AgentConversationSummary {
   id: string;
   title: string;
   createdAt: string;
   updatedAt: string;
}

interface AgentChatState {
   conversations: AgentConversationSummary[];
   activeConversationId: string | null;
   setConversations: (conversations: AgentConversationSummary[]) => void;
   setActiveConversation: (conversationId: string | null) => void;
   startNewChat: () => void;
}

export const useAgentChatStore = create<AgentChatState>((set) => ({
   conversations: [],
   activeConversationId: null,
   setConversations: (conversations) => set({ conversations }),
   setActiveConversation: (conversationId) => set({ activeConversationId: conversationId }),
   startNewChat: () => set({ activeConversationId: null }),
}));
