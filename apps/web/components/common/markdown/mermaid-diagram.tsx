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
            const result = await mermaid.render(`flowie-mermaid-${++sequence}`, code);
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
