import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { Toaster } from '@/components/ui/sonner';
import './globals.css';

const geistSans = Geist({
   variable: '--font-geist-sans',
   subsets: ['latin'],
});

const geistMono = Geist_Mono({
   variable: '--font-geist-mono',
   subsets: ['latin'],
});

const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

export const metadata: Metadata = {
   title: {
      template: '%s | Flowie',
      default: 'Flowie',
   },
   description:
      'Flowie is a collaborative project management platform for teams, projects, and issues.',
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
   keywords: ['project management', 'issues', 'teams', 'workspaces'],
   manifest: '/manifest.webmanifest',
   appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Flowie' },
};

export const viewport: Viewport = {
   themeColor: '#09090b',
   width: 'device-width',
   initialScale: 1,
};

import { ThemeProvider } from '@/components/layout/theme-provider';
import { IssueRelationDialog } from '@/components/common/issues/issue-relation-dialog';
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
                  {children}
                  <IssueRelationDialog />
                  <Toaster />
               </ThemeProvider>
            </NuqsAdapter>
         </body>
      </html>
   );
}
