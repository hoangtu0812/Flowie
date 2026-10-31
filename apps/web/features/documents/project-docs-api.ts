import { authenticatedFetch, loadCurrentWorkspace } from '@/lib/workspaces';
import { responseData } from '@/lib/http';
import type { LiveDocument } from '@/components/common/teams/use-live-team';
import type { DocStatus, DocType, FolderKind, TreeFile, TreeFolder } from '@/lib/document-tree';
import { uploadAttachment } from '@/lib/attachments';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export type ProjectTreeDocument = LiveDocument & {
   docType: DocType;
   status: DocStatus;
   linked: boolean;
   /** Last SharePoint upload, or null when never published. VI: Lần phát hành SharePoint gần nhất. */
   publication: {
      version: number | null;
      /** Release (vN) last published. VI: Phiên bản (vN) đã phát hành gần nhất. */
      release: number | null;
      webUrl: string | null;
      publishedAt: string | null;
      lastError: string | null;
   } | null;
};
export type ProjectTree = {
   projectId: string;
   teamId: string;
   folders: TreeFolder[];
   documents: ProjectTreeDocument[];
   files: TreeFile[];
};

async function send<T>(path: string, init?: RequestInit, query: Record<string, string> = {}) {
   const workspace = await loadCurrentWorkspace();
   const search = new URLSearchParams({ workspaceId: workspace.id, ...query });
   return responseData<T>(
      await authenticatedFetch(`${api}/documents${path}?${search}`, {
         ...init,
         headers: init?.body ? { 'content-type': 'application/json' } : undefined,
         body: init?.body,
      })
   );
}

const withWorkspace = async (body: Record<string, unknown>) =>
   JSON.stringify({ workspaceId: (await loadCurrentWorkspace()).id, ...body });

export const loadProjectTree = (projectId: string) =>
   send<ProjectTree>('/project-tree', undefined, { projectId });

export const scaffoldProjectTree = async (projectId: string) =>
   send<ProjectTree>('/project-tree/scaffold', {
      method: 'POST',
      body: await withWorkspace({ projectId }),
   });

export const createDocumentFolder = async (draft: {
   parentId?: string;
   projectId?: string;
   name: string;
   kind: FolderKind;
   number?: number;
}) => send<TreeFolder>('/folders', { method: 'POST', body: await withWorkspace(draft) });

/** Rename or renumber a folder; `number: null` removes the number. VI: Đổi tên hoặc số của thư mục; `number: null` xoá số. */
export const updateDocumentFolder = (
   id: string,
   draft: { name?: string; number?: number | null }
) =>
   send<TreeFolder>(`/folders/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(draft),
   });

export const createTreeDocument = async (draft: {
   teamId: string;
   folderId: string;
   title: string;
   content: string;
   docType: DocType;
}) => send<LiveDocument>('', { method: 'POST', body: await withWorkspace(draft) });

/** PATCH any editable fields of a document. VI: Cập nhật các trường được phép của tài liệu. */
export const updateTreeDocument = (id: string, draft: Record<string, unknown>) =>
   send<LiveDocument>(`/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(draft),
   });

/** An approved release; `content` is only loaded for one release. VI: Một phiên bản đã duyệt; chỉ tải `content` khi xem một phiên bản. */
export type DocumentRelease = {
   release: number;
   revision: number;
   title: string;
   approvedAt: string;
   approvedBy: { id: string | null; name: string | null };
   content?: string;
};

export const loadReleases = (id: string) =>
   send<{ items: DocumentRelease[] }>(`/${encodeURIComponent(id)}/releases`);

export const loadRelease = (id: string, release: number) =>
   send<DocumentRelease>(`/${encodeURIComponent(id)}/releases/${release}`);

/** Upload a PDF into a tree folder. VI: Tải file PDF lên một thư mục của cây. */
export const uploadFolderFile = async (folderId: string, file: File) =>
   uploadAttachment((await loadCurrentWorkspace()).id, 'document-folder', folderId, file);

/** An issue linked to a document. VI: Một issue liên kết với tài liệu. */
export type LinkedIssue = {
   id: string;
   identifier: string;
   title: string;
   status: { name: string; color: string };
};

export const loadDocumentIssues = (documentId: string) =>
   send<LinkedIssue[]>(`/${encodeURIComponent(documentId)}/issue-links`);

/** Link a document to an issue; returns the issue's documents. VI: Liên kết tài liệu với issue; trả về tài liệu của issue. */
export const linkIssueDocument = async (documentId: string, issueId: string) =>
   send<LiveDocument[]>(`/${encodeURIComponent(documentId)}/issue-links`, {
      method: 'POST',
      body: await withWorkspace({ issueId }),
   });

/** Remove a document–issue link; returns the issue's documents. VI: Gỡ liên kết tài liệu–issue; trả về tài liệu của issue. */
export const unlinkIssueDocument = (documentId: string, issueId: string) =>
   send<LiveDocument[]>(
      `/${encodeURIComponent(documentId)}/issue-links/${encodeURIComponent(issueId)}`,
      { method: 'DELETE' }
   );

export const loadIssueDocuments = (issueId: string) =>
   send<LiveDocument[]>('/issue-links', undefined, { issueId });

export type ReviewPerson = { id: string; name: string; avatarUrl: string | null };
/** Review of a document: who approves, who reviews and what the viewer may do.
 * VI: Trạng thái duyệt tài liệu: ai duyệt cuối, ai review và người xem được làm gì. */
export type DocumentReview = {
   documentId: string;
   status: DocStatus;
   authorId: string;
   approvers: ReviewPerson[];
   reviewers: (ReviewPerson & {
      decision: 'APPROVED' | 'CHANGES_REQUESTED' | null;
      note: string | null;
      decidedAt: string | null;
   })[];
   /** Team members a lead may assign; empty for everyone else. VI: Thành viên team lead được chọn; rỗng với người khác. */
   members: ReviewPerson[];
   canAssign: boolean;
   canDecide: boolean;
   canApprove: boolean;
   approveBlockedReason: string | null;
};

export const loadDocumentReview = (documentId: string) =>
   send<DocumentReview>(`/${encodeURIComponent(documentId)}/review`);

export const setDocumentReviewers = async (documentId: string, reviewerIds: string[]) =>
   send<DocumentReview>(`/${encodeURIComponent(documentId)}/review/reviewers`, {
      method: 'PUT',
      body: await withWorkspace({ reviewerIds }),
   });

export const decideDocumentReview = async (
   documentId: string,
   decision: 'APPROVED' | 'CHANGES_REQUESTED',
   note?: string
) =>
   send<DocumentReview>(`/${encodeURIComponent(documentId)}/review/decision`, {
      method: 'POST',
      body: await withWorkspace({ decision, note }),
   });
