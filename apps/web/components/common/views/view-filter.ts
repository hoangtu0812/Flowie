import type { Issue } from '@/types/issues';
import type { Project } from '@/mock-data/projects';
import type { LiveView } from './use-live-views';

const values = (filters: Record<string, unknown>, key: string) =>
   Array.isArray(filters[key]) ? (filters[key] as string[]) : [];

export function viewIssues(view: LiveView, issues: Issue[]) {
   const categories = values(view.filters, 'statusCategories');
   const statuses = values(view.filters, 'statusIds');
   const labels = values(view.filters, 'labelIds');
   const priorities = values(view.filters, 'priorityIds');
   const teamId = typeof view.filters.teamId === 'string' ? view.filters.teamId : undefined;
   return issues.filter((issue) => {
      if (categories.length && !categories.includes(issue.status.category)) return false;
      if (statuses.length && !statuses.includes(issue.status.id)) return false;
      if (labels.length && !issue.labels.some((label) => labels.includes(label.id))) return false;
      if (priorities.length && !priorities.includes(issue.priority.id)) return false;
      if (view.filters.hasProject === true && !issue.project) return false;
      if (view.filters.unassigned === true && issue.assignee) return false;
      return !teamId || issue.project?.teamId === teamId;
   });
}

export function viewProjects(view: LiveView, projects: Project[]) {
   const priorities = values(view.filters, 'priorityIds');
   const teamId = typeof view.filters.teamId === 'string' ? view.filters.teamId : undefined;
   return projects.filter(
      (project) =>
         (!priorities.length || priorities.includes(project.priority.id)) &&
         (!teamId || project.teamId === teamId)
   );
}
