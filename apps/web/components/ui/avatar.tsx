'use client';

import * as React from 'react';
import * as AvatarPrimitive from '@radix-ui/react-avatar';

import { cn } from '@/lib/utils';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

function resolveAvatarSource(src: React.ComponentProps<typeof AvatarPrimitive.Image>['src']) {
   if (typeof src !== 'string') return src;
   if (src.startsWith('/users/')) return `${api}${src}`;
   if (!src.startsWith('avatars/')) return src;

   const userId = src.split('/')[1];
   return userId ? `${api}/users/${encodeURIComponent(userId)}/avatar` : undefined;
}

function Avatar({ className, ...props }: React.ComponentProps<typeof AvatarPrimitive.Root>) {
   return (
      <AvatarPrimitive.Root
         data-slot="avatar"
         className={cn('relative flex size-8 shrink-0 overflow-hidden rounded-full', className)}
         {...props}
      />
   );
}

function AvatarImage({
   className,
   src,
   ...props
}: React.ComponentProps<typeof AvatarPrimitive.Image>) {
   return (
      <AvatarPrimitive.Image
         data-slot="avatar-image"
         className={cn('aspect-square size-full', className)}
         src={resolveAvatarSource(src)}
         {...props}
      />
   );
}

function AvatarFallback({
   className,
   ...props
}: React.ComponentProps<typeof AvatarPrimitive.Fallback>) {
   return (
      <AvatarPrimitive.Fallback
         data-slot="avatar-fallback"
         className={cn(
            'bg-muted flex size-full items-center justify-center rounded-full',
            className
         )}
         {...props}
      />
   );
}

export { Avatar, AvatarImage, AvatarFallback };
