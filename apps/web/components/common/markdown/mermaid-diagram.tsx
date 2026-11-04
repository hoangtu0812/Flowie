'use client';

import { useContext, useEffect, useState } from 'react';
import { VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { MarkdownContext } from './markdown-context';
import { InlineMedia } from './inline-media';
import type { MediaBounds } from '@/lib/inline-media';
import { MermaidSettings, useMermaidPreferences } from './mermaid-settings';
import { useMessages } from '@/features/shared/use-messages';

let sequence = 0;
let rendering: Promise<unknown> = Promise.resolve();
type Diagram = { url: string; bounds: MediaBounds };

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
   const preferences = useMermaidPreferences();
   const tx = useMessages({
      'Mermaid diagram': 'Sơ đồ Mermaid',
      'Diagram could not be rendered.': 'Không thể vẽ sơ đồ.',
      'Loading diagram…': 'Đang vẽ sơ đồ…',
   });
   const [diagram, setDiagram] = useState<Diagram>();
   const [failed, setFailed] = useState(false);
   useEffect(() => {
      let active = true;
      let url: string | undefined;
      setDiagram(undefined);
      setFailed(false);
      const task = rendering
         .catch(() => undefined)
         .then(async () => {
            if (!active) return;
            const mermaid = (await import('mermaid')).default;
            const baseConfig = {
               ...config,
               theme:
                  config?.theme ??
                  (document.documentElement.classList.contains('dark') ? 'dark' : 'default'),
               // Match HTML label measurement and standalone image layout without host resets.
               // VI: Giữ cách đo nhãn HTML và layout ảnh độc lập nhất quán, không phụ thuộc reset của app.
               themeCSS:
                  'foreignObject p { margin: 0; font: inherit; color: inherit; } foreignObject * { box-sizing: border-box; }',
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
            } as const;
            // Preserve the existing semicolon retry for sequence labels without changing valid diagrams.
            // VI: Giữ lần thử lại dấu chấm phẩy trong nhãn sequence mà không đổi sơ đồ hợp lệ.
            const render = async (source: string) => {
               mermaid.initialize({ ...baseConfig, secure: [...baseConfig.secure] });
               if (preferences.theme !== 'document' || preferences.curve !== 'document') {
                  await mermaid.parse(source);
                  const effective = mermaid.mermaidAPI.getConfig();
                  // Capture source directives first, then lock only explicitly overridden fields.
                  // VI: Nhận directive nguồn trước, sau đó khóa các trường được ghi đè rõ ràng.
                  mermaid.initialize({
                     ...effective,
                     ...(preferences.theme === 'document'
                        ? {}
                        : { theme: preferences.theme, themeVariables: undefined }),
                     flowchart: {
                        ...effective.flowchart,
                        ...(preferences.curve === 'document' ? {} : { curve: preferences.curve }),
                     },
                     secure: [
                        ...baseConfig.secure,
                        ...(preferences.theme === 'document' ? [] : ['theme', 'themeVariables']),
                        ...(preferences.curve === 'document' ? [] : ['flowchart']),
                     ],
                  });
               }
               return mermaid.render(`flowie-mermaid-${++sequence}`, source);
            };
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
            const palette = mermaid.mermaidAPI.getConfig().themeVariables;
            const background = preferences.customBackground
               ? preferences.background
               : palette?.background;
            root.setAttribute('width', String(width));
            root.setAttribute('height', String(height));
            root.removeAttribute('style');
            root.setAttribute('color', palette?.textColor ?? (palette?.darkMode ? '#ddd' : '#333'));
            if (background && background !== 'transparent') {
               const rect = root.ownerDocument.createElementNS(
                  'http://www.w3.org/2000/svg',
                  'rect'
               );
               for (const [name, value] of Object.entries({
                  x,
                  y,
                  width,
                  height,
                  fill: background,
               }))
                  rect.setAttribute(name, String(value));
               rect.setAttribute('data-preview-background', 'true');
               root.insertBefore(rect, root.firstChild);
            }
            // An inert SVG image retains Mermaid's own styles without inheriting app/prose CSS.
            // VI: Ảnh SVG bất hoạt giữ CSS riêng của Mermaid, không kế thừa CSS app/prose.
            url = URL.createObjectURL(
               new Blob([new XMLSerializer().serializeToString(root)], { type: 'image/svg+xml' })
            );
            setDiagram({ url, bounds: { x, y, width, height } });
         });
      rendering = task;
      void task.catch(() => {
         if (active) setFailed(true);
      });
      return () => {
         active = false;
         if (url) URL.revokeObjectURL(url);
      };
   }, [code, config, preferences]);
   const content = failed ? (
      <VStack gap={1} className="my-2">
         <Text role="alert">{tx('Diagram could not be rendered.')}</Text>
         <pre className="overflow-auto rounded bg-muted p-3 text-xs">{code}</pre>
      </VStack>
   ) : !diagram ? (
      <Text role="status">{tx('Loading diagram…')}</Text>
   ) : documentMedia ? (
      <InlineMedia key={diagram.url} label={tx('Mermaid diagram')} bounds={diagram.bounds}>
         <image
            data-mermaid-image="true"
            href={diagram.url}
            x={diagram.bounds.x}
            y={diagram.bounds.y}
            width={diagram.bounds.width}
            height={diagram.bounds.height}
         />
      </InlineMedia>
   ) : (
      <svg
         role="img"
         aria-label={tx('Mermaid diagram')}
         viewBox={`0 0 ${diagram.bounds.width} ${diagram.bounds.height}`}
         width={diagram.bounds.width}
         height={diagram.bounds.height}
         className="my-2 h-auto max-w-full"
      >
         <image
            data-mermaid-image="true"
            href={diagram.url}
            width={diagram.bounds.width}
            height={diagram.bounds.height}
         />
      </svg>
   );
   return (
      <VStack gap={1} className="min-w-0 w-full">
         <MermaidSettings busy={!diagram && !failed} />
         {content}
      </VStack>
   );
}
