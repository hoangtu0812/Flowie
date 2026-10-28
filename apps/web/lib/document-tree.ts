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
}

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

export interface TreeNode<D extends TreeDocument = TreeDocument> {
   folder: TreeFolder;
   children: TreeNode<D>[];
   documents: D[];
}

const byPosition = (a: TreeFolder, b: TreeFolder) =>
   a.position - b.position || a.name.localeCompare(b.name);

/**
 * Nests folders under their parents and files documents into them. Folders whose parent is
 * not in the list become roots, so a partial tree still renders. Documents outside every
 * folder (linked ones) are returned as `unfiled`.
 * VI: Lồng thư mục dưới thư mục cha và xếp tài liệu vào. Thư mục có cha không nằm trong
 * VI: danh sách thành thư mục gốc, nên cây thiếu một phần vẫn hiển thị được. Tài liệu không
 * VI: thuộc thư mục nào (tài liệu liên kết) được trả về trong `unfiled`.
 */
export function buildTree<D extends TreeDocument>(
   folders: TreeFolder[],
   documents: D[]
): { roots: TreeNode<D>[]; unfiled: D[] } {
   const nodes = new Map<string, TreeNode<D>>(
      folders.map((folder) => [folder.id, { folder, children: [], documents: [] }])
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
   for (const node of nodes.values()) node.documents.sort((a, b) => a.title.localeCompare(b.title));
   return { roots, unfiled };
}

const fold = (value: string) =>
   value.normalize('NFD').replace(/\p{M}/gu, '').replace(/đ/gi, 'd').toLowerCase();

/**
 * Keeps documents matching the type and the query (title or content, ignoring case and
 * Vietnamese accents) and the folders leading to them; a folder whose own name matches the
 * query keeps its whole subtree. With no query and no type the tree is returned unchanged.
 * VI: Giữ tài liệu khớp loại và từ khoá (tiêu đề hoặc nội dung, không phân biệt hoa thường
 * VI: và dấu tiếng Việt) cùng các thư mục dẫn tới chúng; thư mục có tên khớp từ khoá giữ
 * VI: nguyên nhánh con. Không có từ khoá và loại thì trả nguyên cây.
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
      if (needle && docType === 'ALL' && fold(node.folder.name).includes(needle)) return node;
      const children = node.children.map(visit).filter((child): child is TreeNode<D> => !!child);
      const documents = node.documents.filter(keep);
      return children.length || documents.length ? { ...node, children, documents } : null;
   };
   return nodes.map(visit).filter((node): node is TreeNode<D> => !!node);
}
