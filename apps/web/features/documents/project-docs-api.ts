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
}) => send<TreeFolder>('/folders', { method: 'POST', body: await withWorkspace(draft) });

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

/** Upload a PDF into a tree folder. VI: Tải file PDF lên một thư mục của cây. */
export const uploadFolderFile = async (folderId: string, file: File) =>
   uploadAttachment((await loadCurrentWorkspace()).id, 'document-folder', folderId, file);

export const loadIssueDocuments = (issueId: string) =>
   send<LiveDocument[]>('/issue-links', undefined, { issueId });
