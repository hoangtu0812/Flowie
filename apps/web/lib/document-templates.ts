import type { DocType } from './document-tree';

/**
 * Starting content for new FDS and TDS documents, so every feature document covers the same
 * sections in the same order; other types start empty.
 * VI: Nội dung khởi tạo cho tài liệu FDS và TDS mới, để mọi tài liệu tính năng có cùng các
 * VI: mục theo cùng thứ tự; các loại khác bắt đầu trống.
 */
export function documentTemplate(docType: DocType, feature: string): string {
   if (docType === 'FDS')
      return `# FDS · ${feature}

## 1. Mục tiêu
## 2. Phạm vi
## 3. Người dùng và vai trò
## 4. Luồng nghiệp vụ

\`\`\`mermaid
flowchart LR
  A[Bắt đầu] --> B[Bước chính] --> C[Kết thúc]
\`\`\`

## 5. Quy tắc nghiệp vụ
## 6. Giao diện
## 7. Tiêu chí nghiệm thu
## 8. Ngoài phạm vi
`;
   if (docType === 'TDS')
      return `# TDS · ${feature}

## 1. Kiến trúc
## 2. Dữ liệu và migration
## 3. API / MCP
## 4. Trình tự xử lý

\`\`\`mermaid
sequenceDiagram
  participant Web
  participant API
  Web->>API: Yêu cầu
  API-->>Web: Kết quả
\`\`\`

## 5. Bảo mật và phân quyền
## 6. Hiệu năng
## 7. Kế hoạch kiểm thử
## 8. Triển khai và rollback
`;
   return '';
}

/** Title for a new document: "FDS · Feature", or the plain name for other types. */
/** VI: Tiêu đề tài liệu mới: "FDS · Tính năng", hoặc tên thường với loại khác. */
export const documentTitle = (docType: DocType, name: string) =>
   docType === 'FDS' || docType === 'TDS' ? `${docType} · ${name.trim()}` : name.trim();
