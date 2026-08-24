import { create } from 'zustand';

interface IssueRelationDialogState {
   issueId?: string;
   open: boolean;
   openForIssue: (issueId: string) => void;
   close: () => void;
}

/** Shared by the original issue context menu and the Issue detail relation section. */
export const useIssueRelationDialogStore = create<IssueRelationDialogState>((set) => ({
   issueId: undefined,
   open: false,
   openForIssue: (issueId) => set({ issueId, open: true }),
   close: () => set({ open: false, issueId: undefined }),
}));
