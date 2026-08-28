import { LoadingState } from '@/components/common/loading-state';

export default function Loading() {
   return (
      <main className="min-h-svh bg-background">
         <LoadingState label="Loading workspace…" />
      </main>
   );
}
