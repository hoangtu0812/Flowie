import { CircleSlash2 } from 'lucide-react';

/** Keeps unsupported original routes truthful without replacing the surrounding app layout. */
export function FeatureUnavailable({ title, description }: { title: string; description: string }) {
   return (
      <div className="flex min-h-full items-center justify-center px-6 py-16">
         <div className="max-w-md text-center">
            <CircleSlash2 className="mx-auto size-7 text-muted-foreground" />
            <h1 className="mt-4 text-lg font-semibold">{title}</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
         </div>
      </div>
   );
}
