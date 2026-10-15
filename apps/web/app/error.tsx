'use client';
import { RecoveryScreen } from '@/features/shared/recovery-screen';
import { useErrorReference } from '@/features/shared/error-reporting';

export default function ErrorPage({
   error,
   reset,
}: {
   error: Error & { digest?: string };
   reset: () => void;
}) {
   const reference = useErrorReference(error.digest);
   return (
      <RecoveryScreen
         title="This page could not open"
         message="Try loading the page again or return home."
         reference={reference}
         retry={reset}
      />
   );
}
