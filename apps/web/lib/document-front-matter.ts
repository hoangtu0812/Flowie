import { parseDocument } from 'yaml';
import type { MermaidConfig } from 'mermaid';

export type DocumentMermaidConfig = {
   theme?: 'default' | 'dark' | 'forest' | 'neutral' | 'base';
   flowchart?: {
      curve?: NonNullable<MermaidConfig['flowchart']>['curve'];
      nodeSpacing?: number;
      rankSpacing?: number;
      padding?: number;
      diagramPadding?: number;
   };
};
const record = (value: unknown): value is Record<string, unknown> =>
   !!value && typeof value === 'object' && !Array.isArray(value);
const curves = [
   'linear',
   'basis',
   'cardinal',
   'step',
   'stepBefore',
   'stepAfter',
   'monotoneX',
   'monotoneY',
   'catmullRom',
];

/**
 * Reads only a bounded leading YAML block and copies known display settings into fresh objects.
 * Aliases/custom tags and arbitrary Mermaid security/CSS keys never enter the renderer config.
 * An unterminated header stays visible, avoiding accidental removal of the rest of the document.
 * VI: Chỉ đọc khối YAML đầu có giới hạn và sao chép cấu hình hiển thị đã biết sang object mới.
 * Alias/tag tùy biến và khóa bảo mật/CSS Mermaid tùy ý không vào config renderer. Header chưa
 * đóng giữ nguyên để tránh vô tình ẩn phần còn lại của tài liệu.
 */
export function documentFrontMatter(source: string): {
   body: string;
   config: DocumentMermaidConfig;
   error?: boolean;
} {
   const start = /^\uFEFF?---[ \t]*\r?\n/.exec(source);
   if (!start) return { body: source, config: {} };
   const tail = source.slice(start[0].length);
   const end = /^(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/m.exec(tail);
   if (!end) return { body: source, config: {}, error: true };
   const body = tail.slice(end.index + end[0].length);
   const raw = tail.slice(0, end.index);
   if (raw.length > 32768) return { body, config: {}, error: true };
   try {
      const yaml = parseDocument(raw, { schema: 'core', uniqueKeys: true });
      if (yaml.errors.length || yaml.warnings.length) throw new Error('yaml');
      const data: unknown = yaml.toJS({ maxAliasCount: 0 });
      if (data == null) return { body, config: {} };
      if (!record(data)) throw new Error('metadata');
      if (data.mermaid == null) return { body, config: {} };
      if (!record(data.mermaid)) throw new Error('mermaid');
      const mermaid = data.mermaid;
      const config: DocumentMermaidConfig = {};
      if (mermaid.theme != null) {
         if (!['default', 'dark', 'forest', 'neutral', 'base'].includes(String(mermaid.theme)))
            throw new Error('theme');
         config.theme = mermaid.theme as DocumentMermaidConfig['theme'];
      }
      if (mermaid.flowchart != null) {
         if (!record(mermaid.flowchart)) throw new Error('flowchart');
         const flowchart: NonNullable<DocumentMermaidConfig['flowchart']> = {};
         if (mermaid.flowchart.curve != null) {
            if (!curves.includes(String(mermaid.flowchart.curve))) throw new Error('curve');
            flowchart.curve = String(mermaid.flowchart.curve) as NonNullable<
               DocumentMermaidConfig['flowchart']
            >['curve'];
         }
         for (const key of ['nodeSpacing', 'rankSpacing', 'padding', 'diagramPadding'] as const) {
            const value = mermaid.flowchart[key];
            if (value == null) continue;
            if (typeof value !== 'number' || !Number.isFinite(value) || value < 1 || value > 400)
               throw new Error('spacing');
            flowchart[key] = value;
         }
         config.flowchart = flowchart;
      }
      return { body, config };
   } catch {
      return { body, config: {}, error: true };
   }
}
