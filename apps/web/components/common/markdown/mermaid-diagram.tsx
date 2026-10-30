'use client';

import { useEffect, useState } from 'react';

let sequence = 0;

/**
 * Renders a ```mermaid code block as an SVG diagram. The Mermaid library (large) is loaded
 * only when a page contains a diagram; `securityLevel: 'strict'` sanitizes labels and
 * disables click handlers, since diagram text comes from user documents. A diagram that
 * fails to parse falls back to its source with a short notice.
 * VI: Vẽ code block ```mermaid thành sơ đồ SVG. Thư viện Mermaid (lớn) chỉ được tải khi
 * VI: trang có sơ đồ; `securityLevel: 'strict'` làm sạch nhãn và tắt xử lý click, vì nội dung
 * VI: sơ đồ đến từ tài liệu người dùng. Sơ đồ lỗi cú pháp sẽ hiện mã nguồn kèm thông báo.
 */
export function MermaidDiagram({ code }: { code: string }) {
   const [svg, setSvg] = useState<string>();
   const [failed, setFailed] = useState(false);

   useEffect(() => {
      let active = true;
      setSvg(undefined);
      setFailed(false);
      void (async () => {
         try {
            const mermaid = (await import('mermaid')).default;
            mermaid.initialize({
               startOnLoad: false,
               securityLevel: 'strict',
               theme: document.documentElement.classList.contains('dark') ? 'dark' : 'default',
            });
            // Mermaid ends a statement at `;`, so a sequence message such as `A->>B: draft; review`
            // fails to parse. A failed diagram containing `;` is drawn once more with each `;`
            // written as the entity `#59;`, which renders as `;`; valid diagrams never retry.
            // VI: Mermaid kết thúc câu lệnh tại `;`, nên message như `A->>B: nháp; duyệt` bị lỗi
            // VI: cú pháp. Sơ đồ lỗi có `;` được vẽ lại một lần với mỗi `;` viết thành mã `#59;`,
            // VI: hiển thị thành `;`; sơ đồ hợp lệ không bao giờ phải vẽ lại.
            const render = (source: string) =>
               mermaid.render(`flowie-mermaid-${++sequence}`, source);
            const result = await render(code).catch((error: unknown) => {
               if (!code.includes(';')) throw error;
               return render(code.replaceAll(';', '#59;'));
            });
            if (active) setSvg(result.svg);
         } catch {
            if (active) setFailed(true);
         }
      })();
      return () => {
         active = false;
      };
   }, [code]);

   if (failed)
      return (
         <div className="my-2 space-y-1">
            <p className="text-xs text-muted-foreground">Diagram could not be rendered.</p>
            <pre className="overflow-auto rounded bg-muted p-3 text-xs">{code}</pre>
         </div>
      );
   if (!svg)
      return (
         <span className="my-2 block h-32 w-full max-w-md animate-pulse rounded-md bg-accent/50" />
      );
   return (
      <div
         className="my-2 overflow-x-auto [&_svg]:mx-auto [&_svg]:max-w-full"
         // Mermaid returns DOMPurify-sanitized SVG under securityLevel "strict".
         // VI: Mermaid trả về SVG đã được DOMPurify làm sạch khi dùng securityLevel "strict".
         dangerouslySetInnerHTML={{ __html: svg }}
      />
   );
}
