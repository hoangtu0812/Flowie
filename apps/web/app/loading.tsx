import { FlowieLogo } from '@/components/brand/flowie-logo';

export default function Loading() {
   return (
      <main className="grid min-h-svh place-items-center bg-background">
         <div className="flex flex-col items-center gap-3 text-muted-foreground">
            <FlowieLogo loading label />
            <p className="text-sm">Đang tải workspace…</p>
         </div>
      </main>
   );
}
