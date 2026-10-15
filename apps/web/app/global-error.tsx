'use client';
import '@astryxdesign/core/reset.css';
import '@astryxdesign/core/astryx.css';
import { RecoveryScreen } from '@/features/shared/recovery-screen';

export default function GlobalError({
   error,
   reset,
}: {
   error: Error & { digest?: string };
   reset: () => void;
}) {
   return (
      <html lang="en">
         <body>
            <RecoveryScreen
               title="Flowie could not open"
               message="Try loading the application again."
               reference={error.digest}
               retry={reset}
            />
         </body>
      </html>
   );
}
