'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { LoadingState } from '@/components/common/loading-state';
import { Button } from '@/components/ui/button';
import { RiDonutChartFill } from '@remixicon/react';
import { Box, CopyMinus, Layers, Link2, Plus, Settings } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useLiveTeam } from './use-live-team';

/** Team Home with the unchanged Circle presentation backed by Team/Documents APIs. */
export default function TeamOverview() {
   const { orgId, teamId } = useParams<{ orgId: string; teamId: string }>();
   const { team, documents, loading, error } = useLiveTeam(teamId);

   if (loading) return <LoadingState label="Loading team…" />;
   if (error || !team)
      return (
         <div className="h-full grid place-items-center text-sm text-destructive">
            {error ?? 'Team not found.'}
         </div>
      );

   const pinnedDocuments = documents.filter((document) => document.pinned);
   const goToLinks = [
      { label: 'Team settings', icon: Settings, href: `/${orgId}/settings/teams/${team.id}` },
      { label: 'Issues', icon: CopyMinus, href: `/${orgId}/team/${team.identifier}/all` },
      { label: 'Cycles', icon: RiDonutChartFill, href: `/${orgId}/team/${team.identifier}/cycles` },
      { label: 'Projects', icon: Box, href: `/${orgId}/team/${team.identifier}/projects` },
      { label: 'Views', icon: Layers, href: `/${orgId}/team/${team.identifier}/views` },
   ];

   return (
      <div className="w-full max-w-5xl mx-auto px-8 py-10 flex flex-col lg:flex-row gap-12">
         <div className="flex-1 min-w-0">
            <div className="flex items-center gap-4">
               <div className="inline-flex size-12 bg-muted/50 items-center justify-center rounded-lg text-2xl shrink-0">
                  {team.icon}
               </div>
               <h1 className="text-3xl font-semibold">{team.name}</h1>
            </div>
            <p className="mt-4 text-muted-foreground">
               {team.description || 'Add a description...'}
            </p>

            <div className="mt-12">
               <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold">Team resources</h2>
                  <div className="flex items-center gap-1">
                     <Link href={`/${orgId}/team/${team.identifier}/documents?create=markdown`}>
                        <Button
                           variant="ghost"
                           size="icon"
                           className="size-7 rounded-full border"
                           aria-label="Create team document"
                           title="Create Markdown document"
                        >
                           <Plus className="size-4" />
                        </Button>
                     </Link>
                     <Link href={`/${orgId}/team/${team.identifier}/documents?create=link`}>
                        <Button
                           variant="ghost"
                           size="icon"
                           className="size-7 rounded-full border"
                           aria-label="Add external team resource"
                           title="Add SharePoint, Google Drive or web link"
                        >
                           <Link2 className="size-4" />
                        </Button>
                     </Link>
                  </div>
               </div>
               <div className="mt-4 flex flex-col gap-1">
                  {pinnedDocuments.length === 0 && (
                     <p className="text-sm text-muted-foreground">No resources yet.</p>
                  )}
                  {pinnedDocuments.map((document) => (
                     <Link
                        key={document.id}
                        href={`/${orgId}/team/${team.identifier}/documents`}
                        className="flex items-center gap-2 py-1.5 px-2 -mx-2 rounded-md hover:bg-sidebar/50 text-sm"
                     >
                        <span className="text-base leading-none">{document.icon}</span>
                        <span className="font-medium">{document.title}</span>
                     </Link>
                  ))}
               </div>
            </div>
         </div>

         <div className="w-full lg:w-60 shrink-0">
            <h3 className="text-sm font-medium text-muted-foreground">Members</h3>
            <Link
               href={`/${orgId}/team/${team.identifier}/members`}
               className="mt-2 flex items-center gap-2 hover:opacity-80"
            >
               <div className="flex -space-x-1.5">
                  {team.members.slice(0, 4).map((member) => (
                     <Avatar key={member.user.id} className="size-5 ring-2 ring-background">
                        <AvatarImage
                           src={member.user.avatarUrl ?? undefined}
                           alt={member.user.name}
                        />
                        <AvatarFallback>{member.user.name[0]}</AvatarFallback>
                     </Avatar>
                  ))}
               </div>
               <span className="text-sm text-muted-foreground">{team.members.length}</span>
            </Link>
            <h3 className="text-sm font-medium text-muted-foreground mt-8">Go to</h3>
            <div className="mt-2 flex flex-col">
               {goToLinks.map((link) => (
                  <Link
                     key={link.label}
                     href={link.href}
                     className="flex items-center gap-2.5 py-1.5 px-2 -mx-2 rounded-md hover:bg-sidebar/50 text-sm"
                  >
                     <link.icon className="size-4 text-muted-foreground" />
                     {link.label}
                  </Link>
               ))}
            </div>
         </div>
      </div>
   );
}
