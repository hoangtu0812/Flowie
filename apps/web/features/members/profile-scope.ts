type MemberIssue = { creatorId?: string; assignee?: { id: string } | null };

export function scopeMemberIssues<T extends MemberIssue>(
   issues: readonly T[],
   memberId: string,
   tab: string
): T[] {
   return issues.filter((issue) =>
      tab === 'created' ? issue.creatorId === memberId : issue.assignee?.id === memberId
   );
}
