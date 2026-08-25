import { create } from 'zustand';

export type IssueActionKind =
   | 'duplicate'
   | 'reminder'
   | 'move'
   | 'due-date'
   | 'rename'
   | 'create-related'
   | 'convert-comment'
   | 'archive';

interface IssueActionDialogState {
   issueId?: string;
   kind?: IssueActionKind;
   openForIssue: (issueId: string, kind: IssueActionKind) => void;
   close: () => void;
}

export const useIssueActionDialogStore = create<IssueActionDialogState>((set) => ({
   issueId: undefined,
   kind: undefined,
   openForIssue: (issueId, kind) => set({ issueId, kind }),
   close: () => set({ issueId: undefined, kind: undefined }),
}));
