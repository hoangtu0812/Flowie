import type { DocumentMermaidConfig } from './document-front-matter';

export const mermaidThemes = ['default', 'dark', 'forest', 'neutral', 'base'] as const;
export const mermaidCurves = [
   'linear',
   'basis',
   'cardinal',
   'step',
   'stepBefore',
   'stepAfter',
   'monotoneX',
   'monotoneY',
   'catmullRom',
] as const;
export type MermaidPreferences = {
   theme: 'document' | NonNullable<DocumentMermaidConfig['theme']>;
   curve: 'document' | (typeof mermaidCurves)[number];
   customBackground: boolean;
   background: 'white' | 'transparent' | 'black';
};
export const defaultMermaidPreferences: MermaidPreferences = {
   theme: 'document',
   curve: 'document',
   customBackground: false,
   background: 'white',
};
export function readMermaidPreferences(raw: string | null): MermaidPreferences {
   try {
      const value: unknown = JSON.parse(raw ?? 'null');
      if (!value || typeof value !== 'object') return defaultMermaidPreferences;
      const data = value as Record<string, unknown>;
      return {
         theme: mermaidThemes.includes(data.theme as (typeof mermaidThemes)[number])
            ? (data.theme as MermaidPreferences['theme'])
            : 'document',
         curve: mermaidCurves.includes(data.curve as (typeof mermaidCurves)[number])
            ? (data.curve as MermaidPreferences['curve'])
            : 'document',
         customBackground: data.customBackground === true,
         background: ['white', 'transparent', 'black'].includes(String(data.background))
            ? (data.background as MermaidPreferences['background'])
            : 'white',
      };
   } catch {
      return defaultMermaidPreferences;
   }
}
