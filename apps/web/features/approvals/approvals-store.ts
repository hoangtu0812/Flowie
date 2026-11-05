import { create } from 'zustand';
import { responseData } from '@/lib/http';
import type { DocStatus, DocType } from '@/lib/document-tree';
import { authenticatedFetch, loadCurrentWorkspace } from '@/lib/workspaces';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

type ApprovalBase = {
   /** Source of the item; only documents exist today. VI: Nguồn của phần tử; hiện chỉ có tài liệu. */
   kind: 'document';
   id: string;
   title: string;
   docType: DocType;
   status: DocStatus;
   updatedAt: string;
   team: { id: string; name: string } | null;
   project: { id: string; name: string; identifier: string } | null;
   author: { id: string; name: string | null };
   progress: { agreed: number; total: number };
};
export type WaitingApproval = ApprovalBase & { role: 'REVIEWER' | 'APPROVER' };
export type SubmittedApproval = ApprovalBase & {
   changeRequests: { name: string; note: string | null }[];
};
export type HandledApproval = ApprovalBase & {
   handledAt: string;
   /** Null once a later round cleared it. VI: Null khi vòng sau đã xoá quyết định. */
   decision: 'APPROVED' | 'CHANGES_REQUESTED' | null;
   /** Latest release the user approved. VI: Phiên bản mới nhất người dùng đã duyệt. */
   release: number | null;
};
export type Approvals = {
   waiting: WaitingApproval[];
   submitted: SubmittedApproval[];
   done: HandledApproval[];
};

let latestRequest = 0;

/**
 * One copy of the approval lists for the sidebar and the page, so the badge always equals the
 * Waiting tab. A failed reload keeps the last lists; only the newest request may replace them.
 * VI: Một bản danh sách phê duyệt cho cả sidebar và trang, nên số trên sidebar luôn bằng tab Chờ tôi
 * VI: xử lý. Tải lại lỗi thì giữ danh sách cũ; chỉ yêu cầu mới nhất được thay dữ liệu.
 */
export const useApprovalsStore = create<{
   approvals?: Approvals;
   error?: string;
   load: () => Promise<void>;
}>((set) => ({
   load: async () => {
      const request = ++latestRequest;
      try {
         const workspace = await loadCurrentWorkspace();
         const search = new URLSearchParams({ workspaceId: workspace.id });
         const approvals = await responseData<Approvals>(
            await authenticatedFetch(`${api}/approvals?${search}`)
         );
         if (request === latestRequest) set({ approvals, error: undefined });
      } catch (caught) {
         if (request === latestRequest)
            set({ error: caught instanceof Error ? caught.message : 'Could not load data.' });
      }
   },
}));
