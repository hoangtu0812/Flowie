import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { Toaster } from '@/components/ui/sonner';
import './globals.css';
import '@astryxdesign/core/reset.css';
import '@astryxdesign/core/astryx.css';
import '@astryxdesign/theme-neutral/theme.css';
import { withBasePath } from '@/lib/base-path';

const geistSans = Geist({
   variable: '--font-geist-sans',
   subsets: ['latin'],
});

const geistMono = Geist_Mono({
   variable: '--font-geist-mono',
   subsets: ['latin'],
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export const metadata: Metadata = {
   title: {
      template: '%s | Flowie',
      default: 'Flowie',
   },
   description:
      'Open-source project management and team collaboration platform for work of every kind.',
   icons: {
      icon: withBasePath('/flowie-icon.svg'),
      shortcut: withBasePath('/flowie-icon.svg'),
      apple: withBasePath('/flowie-icon.svg'),
   },
   openGraph: {
      type: 'website',
      locale: 'en_US',
      url: siteUrl,
      siteName: 'Flowie',
      images: [
         {
            url: `${siteUrl}/banner.png`,
            width: 2560,
            height: 1440,
            alt: 'Flowie',
         },
      ],
   },
   twitter: {
      card: 'summary_large_image',
      images: [
         {
            url: `${siteUrl}/banner.png`,
            width: 2560,
            height: 1440,
            alt: 'Flowie',
         },
      ],
   },
   keywords: ['flowie', 'project management', 'team collaboration', 'fastapi', 'next.js'],
};

import { UiPreferencesApplier } from '@/components/layout/ui-preferences-applier';
import { ClientErrorObserver } from '@/features/shared/error-reporting';
import { RouteProgress } from '@/components/layout/route-progress';
import { ThemeProvider } from '@/components/layout/theme-provider';
import { NuqsAdapter } from 'nuqs/adapters/next/app';

export default function RootLayout({
   children,
}: Readonly<{
   children: React.ReactNode;
}>) {
   return (
      <html lang="en" suppressHydrationWarning>
         <body
            className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background`}
            suppressHydrationWarning
         >
            <NuqsAdapter>
               <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
                  <UiPreferencesApplier />
                  <ClientErrorObserver />
                  <RouteProgress />
                  {children}
                  <Toaster />
               </ThemeProvider>
            </NuqsAdapter>
         </body>
      </html>
   );
}
