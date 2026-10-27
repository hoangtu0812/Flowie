import type { MetadataRoute } from 'next';
import { withBasePath } from '@/lib/base-path';

export default function manifest(): MetadataRoute.Manifest {
   return {
      name: 'Flowie',
      short_name: 'Flowie',
      description: 'Collaborative project management for every kind of team.',
      start_url: withBasePath('/'),
      display: 'standalone',
      background_color: '#09090b',
      theme_color: '#09090b',
      icons: [
         {
            src: withBasePath('/flowie-icon.svg'),
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
         },
         {
            src: withBasePath('/flowie-icon.svg'),
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'maskable',
         },
      ],
   };
}
