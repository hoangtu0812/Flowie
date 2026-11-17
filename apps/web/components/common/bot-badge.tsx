import { Bot } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Small "Bot" marker shown beside the name of a bot or agent account, so it is never mistaken
 * for a person even when it signs in with a real email.
 * VI: Nhãn "Bot" nhỏ cạnh tên tài khoản bot hoặc agent, để không bị nhầm với người thật dù đăng
 * VI: nhập bằng email thật.
 */
export function BotBadge({ className }: { className?: string }) {
   return (
      <span
         className={cn(
            'inline-flex shrink-0 items-center gap-0.5 rounded border px-1 text-[10px] font-medium leading-4 text-muted-foreground',
            className
         )}
      >
         <Bot className="size-3" aria-hidden />
         Bot
      </span>
   );
}
