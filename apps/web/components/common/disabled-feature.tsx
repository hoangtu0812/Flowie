export function DisabledFeature({ title }: { title: string }) {
   return (
      <div className="flex h-full min-h-[24rem] items-center justify-center px-6 text-center">
         <div className="max-w-sm space-y-2">
            <h1 className="text-xl font-semibold">{title}</h1>
            <p className="text-sm text-muted-foreground">
               This Flowie feature is not available yet. It will be enabled when its backend and
               integration work are ready.
            </p>
         </div>
      </div>
   );
}
