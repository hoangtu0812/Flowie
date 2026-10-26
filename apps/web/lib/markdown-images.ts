/** An `![alt](src)` image an editor wrote into a plain-text field. */
export type ImageReference = { alt: string; src: string; start: number; end: number };

const IMAGE_MARKDOWN_PATTERN = /!\[([^\]]*)\]\(([^)\s]+)\)/g;

/** Every image a draft references, in the order they appear in the text. */
export function imageReferences(value: string): ImageReference[] {
   return Array.from(value.matchAll(IMAGE_MARKDOWN_PATTERN), (match) => ({
      alt: match[1],
      src: match[2],
      start: match.index,
      end: match.index + match[0].length,
   }));
}

/**
 * Dropping an image takes the line break the paste inserted with it, so the
 * surrounding text does not collect an empty paragraph per removal. Offsets
 * belong to the string they were read from, so callers must pass the value
 * `imageReferences` was given.
 */
export function removeImageReference(value: string, reference: ImageReference): string {
   const prefix = value.slice(0, reference.start).replace(/\n$/, '');
   const suffix = value.slice(reference.end).replace(/^\n/, '');
   if (!prefix) return suffix.replace(/^\n+/, '');
   if (!suffix) return prefix;
   return `${prefix}\n${suffix}`;
}
