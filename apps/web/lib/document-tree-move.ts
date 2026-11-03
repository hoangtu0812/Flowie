import type { TreeFolder } from './document-tree';

export type MoveSource = {
   id: string;
   kind: 'folder' | 'document' | 'file';
   folderId: string | null;
};
export type DropReason = 'missing' | 'same' | 'cycle' | 'depth';
export const MAX_DOCUMENT_FOLDER_DEPTH = 8;

/** Validate the full destination chain and subtree height, independent of visible filters.
 * Missing parents and cycles fail closed; the server rechecks the authoritative tree on write.
 * VI: Kiểm tra chuỗi tổ tiên và chiều cao nhánh con trên toàn cây, không phụ thuộc bộ lọc.
 * VI: Cha thiếu/vòng lặp bị từ chối; máy chủ kiểm tra lại cây chính thức khi ghi. */
export function documentDropReason(
   folders: TreeFolder[],
   source: MoveSource,
   destination: string
): DropReason | null {
   const byId = new Map(folders.map((folder) => [folder.id, folder]));
   if (!byId.has(destination) || (source.kind === 'folder' && !byId.has(source.id)))
      return 'missing';
   if (source.kind === 'folder' && source.id === destination) return 'cycle';
   if (source.folderId === destination) return 'same';
   const seen = new Set<string>();
   let current: TreeFolder | undefined = byId.get(destination);
   while (current) {
      if (seen.has(current.id) || (source.kind === 'folder' && current.id === source.id))
         return 'cycle';
      seen.add(current.id);
      if (current.parentId && !byId.has(current.parentId)) return 'missing';
      current = current.parentId ? byId.get(current.parentId) : undefined;
   }
   if (source.kind !== 'folder') return seen.size > MAX_DOCUMENT_FOLDER_DEPTH ? 'depth' : null;
   let height = 1;
   const visited = new Set<string>();
   const pending = [{ id: source.id, depth: 1 }];
   while (pending.length) {
      const item = pending.pop()!;
      if (visited.has(item.id)) return 'cycle';
      visited.add(item.id);
      height = Math.max(height, item.depth);
      for (const folder of folders) {
         if (folder.parentId === item.id) pending.push({ id: folder.id, depth: item.depth + 1 });
      }
   }
   return seen.size + height > MAX_DOCUMENT_FOLDER_DEPTH ? 'depth' : null;
}

export function documentMoveConflict(
   folders: TreeFolder[],
   source: MoveSource,
   destination: string
): 'name' | 'number' | null {
   if (source.kind !== 'folder') return null;
   const folder = folders.find((item) => item.id === source.id);
   if (!folder) return null;
   const siblings = folders.filter(
      (item) => item.parentId === destination && item.id !== source.id
   );
   if (siblings.some((item) => item.name.toLowerCase() === folder.name.toLowerCase()))
      return 'name';
   return folder.number != null && siblings.some((item) => item.number === folder.number)
      ? 'number'
      : null;
}
