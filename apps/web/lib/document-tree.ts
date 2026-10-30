export type DocType = 'FDS' | 'TDS' | 'ADR' | 'RCA' | 'GUIDE' | 'OTHER';
export type DocStatus = 'DRAFT' | 'IN_REVIEW' | 'APPROVED';
export type FolderKind = 'project' | 'module' | 'feature' | 'changes' | 'general';

export interface TreeFolder {
   id: string;
   parentId: string | null;
   kind: FolderKind;
   name: string;
   icon: string;
   position: number;
   /** Two-digit folder number, or null when unnumbered. VI: Số thư mục hai chữ số, null nếu không đánh số. */
   number?: number | null;
}

/**
 * `NN · name` for a numbered folder, the bare name otherwise; the API builds SharePoint paths
 * from the same label.
 * VI: `NN · tên` với thư mục có số, chỉ tên nếu không có số; API dựng đường dẫn SharePoint từ
 * VI: cùng nhãn này.
 */
export const folderLabel = (folder: { name: string; number?: number | null }) =>
   folder.number == null
      ? folder.name
      : `${String(folder.number).padStart(2, '0')} · ${folder.name}`;

export interface TreeDocument {
   id: string;
   folderId: string | null;
   title: string;
   content: string;
   icon: string;
   docType: DocType;
   status: DocStatus;
   updatedAt: string;
   /** Linked to the project but filed outside its tree. */
   linked?: boolean;
}

/** A file (PDF) uploaded into a folder. VI: File (PDF) được tải lên một thư mục. */
export interface TreeFile {
   id: string;
   folderId: string;
   filename: string;
   mimeType: string;
   size: number;
   createdAt: string;
}

export interface TreeNode<D extends TreeDocument = TreeDocument> {
   folder: TreeFolder;
   children: TreeNode<D>[];
   documents: D[];
   files: TreeFile[];
}

// Numbered folders first, by number; unnumbered ones after them by position, then name.
// VI: Thư mục có số đứng trước, theo số; thư mục không số đứng sau theo vị trí, rồi tên.
const byPosition = (a: TreeFolder, b: TreeFolder) =>
   (a.number ?? 100) - (b.number ?? 100) || a.position - b.position || a.name.localeCompare(b.name);

/**
 * Nests folders under their parents and files documents into them. Folders whose parent is
 * not in the list become roots, so a partial tree still renders. Documents outside every
 * folder (linked ones) are returned as `unfiled`. Files go to their folder; a file whose
 * folder is missing is dropped.
 * VI: Lồng thư mục dưới thư mục cha và xếp tài liệu vào. Thư mục có cha không nằm trong
 * VI: danh sách thành thư mục gốc, nên cây thiếu một phần vẫn hiển thị được. Tài liệu không
 * VI: thuộc thư mục nào (tài liệu liên kết) được trả về trong `unfiled`. File được xếp vào
 * VI: thư mục của nó; file có thư mục không tồn tại bị bỏ qua.
 */
export function buildTree<D extends TreeDocument>(
   folders: TreeFolder[],
   documents: D[],
   files: TreeFile[] = []
): { roots: TreeNode<D>[]; unfiled: D[] } {
   const nodes = new Map<string, TreeNode<D>>(
      folders.map((folder) => [folder.id, { folder, children: [], documents: [], files: [] }])
   );
   const roots: TreeNode<D>[] = [];
   for (const folder of [...folders].sort(byPosition)) {
      const node = nodes.get(folder.id)!;
      const parent = folder.parentId ? nodes.get(folder.parentId) : undefined;
      (parent ? parent.children : roots).push(node);
   }
   const unfiled: D[] = [];
   for (const document of documents) {
      const node = document.folderId ? nodes.get(document.folderId) : undefined;
      if (node && !document.linked) node.documents.push(document);
      else unfiled.push(document);
   }
   for (const file of files) nodes.get(file.folderId)?.files.push(file);
   for (const node of nodes.values()) node.documents.sort((a, b) => a.title.localeCompare(b.title));
   return { roots, unfiled };
}

/** Lower-cases and drops Vietnamese accents for search. VI: Chữ thường, bỏ dấu tiếng Việt để tìm kiếm. */
export const fold = (value: string) =>
   value.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/gi, 'd').toLowerCase();

/**
 * Keeps documents matching the type and the query (title or content, ignoring case and
 * Vietnamese accents) and the folders leading to them; a folder whose own name matches the
 * query keeps its whole subtree. Files have no type, so they match only "all types", by
 * filename. With no query and no type the tree is returned unchanged.
 * VI: Giữ tài liệu khớp loại và từ khoá (tiêu đề hoặc nội dung, không phân biệt hoa thường
 * VI: và dấu tiếng Việt) cùng các thư mục dẫn tới chúng; thư mục có tên khớp từ khoá giữ
 * VI: nguyên nhánh con. File không có loại nên chỉ khớp khi chọn "mọi loại", theo tên file.
 * VI: Không có từ khoá và loại thì trả nguyên cây.
 */
export function filterTree<D extends TreeDocument>(
   nodes: TreeNode<D>[],
   query: string,
   docType: DocType | 'ALL'
): TreeNode<D>[] {
   const needle = fold(query.trim());
   if (!needle && docType === 'ALL') return nodes;
   const keep = (document: D) =>
      (docType === 'ALL' || document.docType === docType) &&
      (!needle || fold(`${document.title}\n${document.content}`).includes(needle));
   const visit = (node: TreeNode<D>): TreeNode<D> | null => {
      if (needle && docType === 'ALL' && fold(folderLabel(node.folder)).includes(needle))
         return node;
      const children = node.children.map(visit).filter((child): child is TreeNode<D> => !!child);
      const documents = node.documents.filter(keep);
      const files = node.files.filter(
         (file) => docType === 'ALL' && (!needle || fold(file.filename).includes(needle))
      );
      return children.length || documents.length || files.length
         ? { ...node, children, documents, files }
         : null;
   };
   return nodes.map(visit).filter((node): node is TreeNode<D> => !!node);
}
