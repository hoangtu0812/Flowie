'use client';

import { AttachmentImage } from '@/components/common/attachment-image';
import { Button } from '@astryxdesign/core/Button';
import { X } from 'lucide-react';
import { VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { imageReferences, removeImageReference } from '@/lib/markdown-images';

/**
 * A plain-text field stores a pasted screenshot as `![alt](url)` markdown, so
 * the editor shows a URL where the author expects a picture. These thumbnails
 * resolve each reference in the draft and remove it without the author having
 * to find the matching markup by hand.
 */
export function DraftImages({
   value,
   onChange,
   label,
   removeLabel,
   isDisabled,
}: {
   value: string;
   onChange: (value: string) => void;
   label: string;
   removeLabel: string;
   isDisabled?: boolean;
}) {
   const references = imageReferences(value);
   if (references.length === 0) return null;
   return (
      <VStack gap={2}>
         <Text type="label">{label}</Text>
         <div className="flex flex-wrap gap-3">
            {references.map((reference) => (
               <figure
                  key={`${reference.start}-${reference.src}`}
                  className="flex w-40 min-w-0 flex-col gap-1"
               >
                  <AttachmentImage
                     src={reference.src}
                     alt={reference.alt}
                     className="my-0 h-24 w-full object-cover"
                  />
                  <figcaption className="truncate text-xs text-muted-foreground">
                     {reference.alt || reference.src}
                  </figcaption>
                  <Button
                     label={removeLabel}
                     tooltip={removeLabel}
                     icon={<X className="size-4" />}
                     isIconOnly
                     variant="ghost"
                     size="sm"
                     className="self-start text-muted-foreground"
                     isDisabled={isDisabled}
                     // Offsets belong to the string they were read from, so the
                     // removal uses the value this render was built on.
                     onClick={() => onChange(removeImageReference(value, reference))}
                  />
               </figure>
            ))}
         </div>
      </VStack>
   );
}
