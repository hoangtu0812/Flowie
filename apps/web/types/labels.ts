export interface LabelInterface {
   id: string;
   name: string;
   color: string;
}

/**
 * Sub project of one project (DTD-915), kept apart from workspace labels. `archivedAt` set means
 * it stays on issues that carry it but is no longer offered for new assignments.
 * VI: Sub project của một dự án (DTD-915), tách khỏi label workspace. Có `archivedAt` nghĩa là vẫn
 * nằm trên issue đang mang nhưng không còn được đề xuất để gán mới.
 */
export interface SubProjectLabel extends LabelInterface {
   projectId?: string;
   archivedAt?: string | null;
}
