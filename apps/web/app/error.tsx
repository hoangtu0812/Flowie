'use client';
import { RecoveryScreen } from '@/features/shared/recovery-screen';

export default function ErrorPage({
   error,
   reset,
}: {
   error: Error & { digest?: string };
   reset: () => void;
}) {
   return (
      <RecoveryScreen
         title="This page could not open"
         message="Try loading the page again or return home."
         reference={error.digest}
         retry={reset}
      />
   );
}
