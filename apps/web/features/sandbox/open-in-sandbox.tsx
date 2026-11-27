'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { SquareTerminal } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
   DropdownMenu,
   DropdownMenuContent,
   DropdownMenuItem,
   DropdownMenuLabel,
   DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useMessages } from '@/features/shared/use-messages';
import {
   loadSandboxRepositories,
   openInSandbox,
   sandboxEnabled,
   type SandboxAgent,
   type SandboxRepository,
} from '@/lib/sandbox';
import { messages } from './messages.vi';

const AGENTS: { agent: SandboxAgent; label: string }[] = [
   { agent: 'claude', label: 'Claude Code' },
   { agent: 'codex', label: 'Codex' },
];

/**
 * "Open with Claude/Codex" on an issue, for people with a sandbox: starts it, opens a terminal
 * session for the issue in the chosen repository and goes to the Sandbox page on that session.
 * VI: "Mở bằng Claude/Codex" trên task, cho người có sandbox: khởi động sandbox, mở phiên
 * VI: terminal cho task trong repository đã chọn và chuyển sang trang Sandbox ở phiên đó.
 */
export function OpenInSandbox({ issueId }: { issueId: string }) {
   const tx = useMessages(messages);
   const { orgId } = useParams<{ orgId: string }>();
   const router = useRouter();
   const [enabled, setEnabled] = useState(false);
   const [repositories, setRepositories] = useState<SandboxRepository[] | null>(null);
   const [opening, setOpening] = useState(false);

   useEffect(() => {
      void sandboxEnabled().then(setEnabled);
   }, []);
   useEffect(() => setRepositories(null), [issueId]);

   if (!enabled) return null;

   const load = (open: boolean) => {
      if (!open || repositories) return;
      loadSandboxRepositories(issueId).then(setRepositories, (error: Error) => {
         setRepositories([]);
         toast.error(error.message);
      });
   };

   const start = async (repository: SandboxRepository, agent: SandboxAgent) => {
      setOpening(true);
      const pending = toast.loading(tx('Starting the sandbox…'));
      try {
         const session = await openInSandbox(issueId, repository.id, agent);
         toast.dismiss(pending);
         router.push(`/${orgId}/sandbox?session=${encodeURIComponent(session)}`);
      } catch (error) {
         toast.error(error instanceof Error ? error.message : String(error), { id: pending });
      } finally {
         setOpening(false);
      }
   };

   return (
      <DropdownMenu onOpenChange={load}>
         <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="xxs" disabled={opening} aria-label={tx('Open with…')}>
               <SquareTerminal className="size-3.5" />
               <span className="hidden sm:inline">{tx('Open with…')}</span>
            </Button>
         </DropdownMenuTrigger>
         <DropdownMenuContent align="end" className="w-64">
            {repositories === null && (
               <DropdownMenuLabel className="font-normal text-muted-foreground">
                  {tx('Loading…')}
               </DropdownMenuLabel>
            )}
            {repositories?.length === 0 && (
               <DropdownMenuLabel className="font-normal text-muted-foreground">
                  {tx('No repository is configured for this project.')}
               </DropdownMenuLabel>
            )}
            {repositories?.map((repository) =>
               AGENTS.map(({ agent, label }) => (
                  <DropdownMenuItem
                     key={`${repository.id}-${agent}`}
                     onClick={() => void start(repository, agent)}
                  >
                     {repositories.length > 1
                        ? tx('{agent} in {repository}', {
                             agent: label,
                             repository: repository.name,
                          })
                        : tx('Open with {agent}', { agent: label })}
                  </DropdownMenuItem>
               ))
            )}
         </DropdownMenuContent>
      </DropdownMenu>
   );
}
