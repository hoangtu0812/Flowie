'use client';
import '@astryxdesign/core/reset.css';
import '@astryxdesign/core/astryx.css';
import { RecoveryScreen } from '@/features/shared/recovery-screen';
import { useErrorReference } from '@/features/shared/error-reporting';

export default function GlobalError({
   error,
   reset,
}: {
   error: Error & { digest?: string };
   reset: () => void;
}) {
   const reference = useErrorReference(error.digest);
   return (
      <html lang="en">
         <body>
            <RecoveryScreen
               title="Flowie could not open"
               message="Try loading the application again."
               reference={reference}
               retry={reset}
            />
         </body>
      </html>
   );
}
