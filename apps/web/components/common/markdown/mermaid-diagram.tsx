'use client';

import { useContext, useEffect, useState } from 'react';
import { VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { MarkdownContext } from './markdown-context';
import { InlineMedia } from './inline-media';
import type { MediaBounds } from '@/lib/inline-media';
import { useMessages } from '@/features/shared/use-messages';

let sequence = 0;
let rendering: Promise<unknown> = Promise.resolve();
type Diagram = { id: string; inner: string; bounds: MediaBounds };

/**
 * Mermaid owns global configuration, so initialize and render share one serialized queue.
 * Each diagram gets its own defaults/document config, while secure keys remain fixed even
 * against directives inside source. Strict rendering sanitizes SVG before it reaches React.
 * VI: Mermaid có cấu hình global nên initialize và render dùng chung hàng đợi tuần tự. Mỗi
 * sơ đồ nhận mặc định/config tài liệu riêng; các khóa bảo mật vẫn cố định dù nguồn có
 * directive. Render strict làm sạch SVG trước khi chuyển sang React.
 */
export function MermaidDiagram({ code }: { code: string }) {
   const { documentMedia, config } = useContext(MarkdownContext);
   const tx = useMessages({
      'Mermaid diagram': 'Sơ đồ Mermaid',
      'Diagram could not be rendered.': 'Không thể vẽ sơ đồ.',
      'Loading diagram…': 'Đang vẽ sơ đồ…',
   });
   const [diagram, setDiagram] = useState<Diagram>();
   const [failed, setFailed] = useState(false);
   useEffect(() => {
      let active = true;
      setDiagram(undefined);
      setFailed(false);
      const task = rendering
         .catch(() => undefined)
         .then(async () => {
            if (!active) return;
            const mermaid = (await import('mermaid')).default;
            mermaid.initialize({
               ...config,
               theme:
                  config?.theme ??
                  (document.documentElement.classList.contains('dark') ? 'dark' : 'default'),
               startOnLoad: false,
               securityLevel: 'strict',
               suppressErrorRendering: true,
               secure: [
                  'secure',
                  'securityLevel',
                  'startOnLoad',
                  'maxTextSize',
                  'maxEdges',
                  'suppressErrorRendering',
                  'dompurifyConfig',
                  'themeCSS',
               ],
            });
            // Preserve the existing semicolon retry for sequence labels without changing valid diagrams.
            // VI: Giữ lần thử lại dấu chấm phẩy trong nhãn sequence mà không đổi sơ đồ hợp lệ.
            const render = (source: string) =>
               mermaid.render(`flowie-mermaid-${++sequence}`, source);
            const result = await render(code).catch((error: unknown) => {
               if (!code.includes(';')) throw error;
               return render(code.replaceAll(';', '#59;'));
            });
            if (!active) return;
            const root = new DOMParser().parseFromString(
               result.svg,
               'image/svg+xml'
            ).documentElement;
            const [x, y, width, height] = (root.getAttribute('viewBox') ?? '')
               .trim()
               .split(/[\s,]+/)
               .map(Number);
            if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0)
               throw new Error('viewBox');
            setDiagram({ id: root.id, inner: root.innerHTML, bounds: { x, y, width, height } });
         });
      rendering = task;
      void task.catch(() => {
         if (active) setFailed(true);
      });
      return () => {
         active = false;
      };
   }, [code, config]);
   if (failed)
      return (
         <VStack gap={1} className="my-2">
            <Text role="alert">{tx('Diagram could not be rendered.')}</Text>
            <pre className="overflow-auto rounded bg-muted p-3 text-xs">{code}</pre>
         </VStack>
      );
   if (!diagram) return <Text role="status">{tx('Loading diagram…')}</Text>;
   const { bounds } = diagram;
   const svg = (
      <svg
         id={diagram.id}
         xmlns="http://www.w3.org/2000/svg"
         x={bounds.x}
         y={bounds.y}
         width={bounds.width}
         height={bounds.height}
         viewBox={`${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`}
         role={documentMedia ? undefined : 'img'}
         aria-label={documentMedia ? undefined : tx('Mermaid diagram')}
         className={documentMedia ? undefined : 'my-2 h-auto max-w-full'}
         // Only Mermaid's strict, DOMPurify-sanitized SVG is mounted; external SVG files use <image>.
         // VI: Chỉ mount SVG Mermaid strict đã qua DOMPurify; file SVG ngoài được nhúng bằng <image>.
         dangerouslySetInnerHTML={{ __html: diagram.inner }}
      />
   );
   return documentMedia ? (
      <InlineMedia key={diagram.id} label={tx('Mermaid diagram')} bounds={bounds}>
         {svg}
      </InlineMedia>
   ) : (
      svg
   );
}
