export interface HealthCheckResponse {
   status: 'ok';
   service: 'api';
   timestamp: string;
}

export interface AuthenticatedUser {
   id: string;
   email: string;
   name: string;
   username: string | null;
   avatarUrl: string | null;
   emailVerified: boolean;
   isPlatformAdmin: boolean;
}

export interface AuthResponse {
   user: AuthenticatedUser;
   workspace: {
      id: string;
      slug: string;
      name: string;
   } | null;
}

export const CONTENT_DOCUMENT_VERSION = 1 as const;

/** Shared rich-text primitives persisted by comments and rendered by the web client. */
export type ContentBlock =
   | { type: 'heading'; text: string; level?: 1 | 2 }
   | { type: 'paragraph'; text: string }
   | { type: 'bullet-list'; items: string[] }
   | { type: 'numbered-list'; items: string[] }
   | { type: 'checklist'; items: { text: string; checked: boolean }[] }
   | { type: 'code'; language: string; code: string }
   | { type: 'image'; alt: string; caption?: string; aspect?: 'wide' | 'video' | 'square' }
   | { type: 'video'; title: string; duration?: string }
   | { type: 'quote'; text: string; author?: string }
   | { type: 'divider' }
   | { type: 'issue-ref'; identifier: string; note?: string };

export type ContentDocument = {
   version: typeof CONTENT_DOCUMENT_VERSION;
   blocks: ContentBlock[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
   value !== null && typeof value === 'object' && !Array.isArray(value);

const isStringArray = (value: unknown): value is string[] =>
   Array.isArray(value) && value.length <= 500 && value.every((item) => typeof item === 'string');

export function isContentBlock(value: unknown): value is ContentBlock {
   if (!isRecord(value) || typeof value.type !== 'string') return false;
   switch (value.type) {
      case 'heading':
         return (
            typeof value.text === 'string' &&
            (value.level === undefined || value.level === 1 || value.level === 2)
         );
      case 'paragraph':
         return typeof value.text === 'string';
      case 'bullet-list':
      case 'numbered-list':
         return isStringArray(value.items);
      case 'checklist':
         return (
            Array.isArray(value.items) &&
            value.items.length <= 500 &&
            value.items.every(
               (item) =>
                  isRecord(item) &&
                  typeof item.text === 'string' &&
                  typeof item.checked === 'boolean'
            )
         );
      case 'code':
         return typeof value.language === 'string' && typeof value.code === 'string';
      case 'image':
         return (
            typeof value.alt === 'string' &&
            (value.caption === undefined || typeof value.caption === 'string') &&
            (value.aspect === undefined ||
               value.aspect === 'wide' ||
               value.aspect === 'video' ||
               value.aspect === 'square')
         );
      case 'video':
         return (
            typeof value.title === 'string' &&
            (value.duration === undefined || typeof value.duration === 'string')
         );
      case 'quote':
         return (
            typeof value.text === 'string' &&
            (value.author === undefined || typeof value.author === 'string')
         );
      case 'divider':
         return true;
      case 'issue-ref':
         return (
            typeof value.identifier === 'string' &&
            (value.note === undefined || typeof value.note === 'string')
         );
      default:
         return false;
   }
}

export function isContentDocument(value: unknown): value is ContentDocument {
   return (
      isRecord(value) &&
      value.version === CONTENT_DOCUMENT_VERSION &&
      Array.isArray(value.blocks) &&
      value.blocks.length <= 200 &&
      value.blocks.every(isContentBlock)
   );
}

export function contentDocumentFromText(text: string): ContentDocument {
   return { version: CONTENT_DOCUMENT_VERSION, blocks: [{ type: 'paragraph', text }] };
}

export function contentDocumentToPlainText(document: ContentDocument): string {
   return document.blocks
      .flatMap((block) => {
         switch (block.type) {
            case 'heading':
            case 'paragraph':
            case 'quote':
               return [block.text];
            case 'bullet-list':
            case 'numbered-list':
               return block.items;
            case 'checklist':
               return block.items.map((item) => item.text);
            case 'code':
               return [block.code];
            case 'image':
               return [block.caption ?? block.alt];
            case 'video':
               return [block.title];
            case 'issue-ref':
               return [block.note ? `${block.identifier} ${block.note}` : block.identifier];
            case 'divider':
               return [];
         }
      })
      .map((part) => part.trim())
      .filter(Boolean)
      .join('\n');
}

/** Safely upgrades nullable/legacy JSON payloads to the current runtime contract. */
export function normalizeContentDocument(value: unknown, fallbackText = ''): ContentDocument {
   return isContentDocument(value) ? value : contentDocumentFromText(fallbackText);
}
