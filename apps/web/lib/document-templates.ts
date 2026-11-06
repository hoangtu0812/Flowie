import type { DocType } from './document-tree';

/**
 * Starting sections for each document type that has a template, so every document of a type
 * covers the same sections in the same order. Types missing here (ADR, RCA, GUIDE, OTHER) start
 * empty and keep the plain title the user typed.
 * VI: Các mục khởi tạo cho từng loại tài liệu có mẫu, để mọi tài liệu cùng loại có cùng các mục
 * VI: theo cùng thứ tự. Loại không có ở đây (ADR, RCA, GUIDE, OTHER) bắt đầu trống và giữ nguyên
 * VI: tiêu đề người dùng nhập.
 */
const TEMPLATES: Partial<Record<DocType, string>> = {
   FDS: `## 1. Mục tiêu
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
`,
   TDS: `## 1. Kiến trúc
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
`,
   BRD: `## 1. Bối cảnh và vấn đề
## 2. Mục tiêu nghiệp vụ
## 3. Các bên liên quan
## 4. Phạm vi
## 5. Quy trình hiện tại và quy trình mong muốn
## 6. Yêu cầu nghiệp vụ

| Mã | Yêu cầu | Độ ưu tiên |
|---|---|---|
| BR-01 |  | Cao |

## 7. Giả định và ràng buộc
## 8. Tiêu chí thành công
`,
   SRS: `## 1. Giới thiệu
## 2. Mô tả tổng quan
## 3. Yêu cầu chức năng

| Mã | Yêu cầu | Nguồn (BRD) |
|---|---|---|
| FR-01 |  | BR-01 |

## 4. Yêu cầu phi chức năng
## 5. Giao tiếp hệ thống và dữ liệu
## 6. Ràng buộc
## 7. Phụ lục
`,
   PROTOTYPE: `## 1. Mục đích
## 2. Liên kết bản mẫu (Figma, ảnh màn hình)
## 3. Luồng màn hình

\`\`\`mermaid
flowchart LR
  A[Màn hình 1] --> B[Màn hình 2]
\`\`\`

## 4. Mô tả từng màn hình
## 5. Phản hồi và quyết định
`,
   TEST: `## 1. Phạm vi kiểm thử
## 2. Môi trường và dữ liệu
## 3. Kịch bản kiểm thử

| Mã | Kịch bản | Kết quả mong đợi | Kết quả |
|---|---|---|---|
| TC-01 |  |  |  |

## 4. Tiêu chí đạt
## 5. Kết quả và lỗi phát hiện
`,
   MINUTES: `- **Thời gian:**
- **Địa điểm:**
- **Thành phần:**

## 1. Nội dung
## 2. Quyết định
## 3. Việc cần làm

| Việc | Người phụ trách | Hạn |
|---|---|---|
|  |  |  |
`,
};

/** Template for a new document, or '' for a type without one. */
/** VI: Mẫu cho tài liệu mới, hoặc '' với loại không có mẫu. */
export function documentTemplate(docType: DocType, name: string): string {
   const body = TEMPLATES[docType];
   return body ? `# ${docType} · ${name}\n\n${body}` : '';
}

export const hasTemplate = (docType: DocType) => docType in TEMPLATES;

/** Title for a new document: "BRD · Name" for a templated type, the plain name otherwise. */
/** VI: Tiêu đề tài liệu mới: "BRD · Tên" với loại có mẫu, tên thường với loại khác. */
export const documentTitle = (docType: DocType, name: string) =>
   hasTemplate(docType) ? `${docType} · ${name.trim()}` : name.trim();
