type Membership = { workspace: { id: string; slug: string } };

/** Keep legacy deep links while making workspace identity independent of its name. */
export function canonicalWorkspacePath(
   pathname: string,
   memberships: Membership[],
   suffix = ''
): string | undefined {
   const segment = pathname.split('/')[1];
   if (!segment) return undefined;
   let key: string;
   try {
      key = decodeURIComponent(segment);
   } catch {
      return undefined;
   }
   if (memberships.some(({ workspace }) => workspace.id === key)) return undefined;
   const workspace = memberships.find(({ workspace }) => workspace.slug === key)?.workspace;
   if (!workspace) return undefined;
   return `/${encodeURIComponent(workspace.id)}${pathname.slice(segment.length + 1)}${suffix}`;
}
