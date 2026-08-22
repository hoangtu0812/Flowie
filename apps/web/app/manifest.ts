import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
   return {
      name: 'Flowie',
      short_name: 'Flowie',
      description: 'Collaborative project management for every kind of team.',
      start_url: '/',
      display: 'standalone',
      background_color: '#09090b',
      theme_color: '#09090b',
      icons: [
         { src: '/flowie-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
         {
            src: '/flowie-icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'maskable',
         },
      ],
   };
}
