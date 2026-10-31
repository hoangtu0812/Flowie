/** What a page knows beyond its path. VI: Những gì trang biết thêm ngoài path. */
export type PageTitleContext = {
   /** Workspace name, once loaded. VI: Tên workspace khi đã tải. */
   workspace?: string;
   /** Name of the object the page shows (issue, project, team…), only for this path.
    * VI: Tên đối tượng trang đang hiển thị (issue, dự án, team…), chỉ cho path này. */
   entity?: string;
};

const WORKSPACE_PAGES: Record<string, string> = {
   '': 'Inbox',
   'inbox': 'Inbox',
   'dashboard': 'Dashboard',
   'my-issues': 'My issues',
   'issues': 'All issues',
   'issues/active': 'Active issues',
   'issues/backlog': 'Backlog',
   'issues/bugs': 'Bugs',
   'issues/no-team': 'No team - Issues',
   'issues/no-project': 'No project - Issues',
   'projects': 'Projects',
   'initiatives': 'Initiatives',
   'views': 'Views',
   'teams': 'Teams',
   'members': 'Members',
   'docs': 'Docs',
   'search': 'Search',
   'reports': 'Reports',
   'agent': 'Agent',
   'news': 'News',
   'reviews': 'Assigned reviews',
   'reviews/created': 'Created reviews',
};

const ACCOUNT_SETTINGS: Record<string, string> = {
   '': 'Preferences',
   'profile': 'Profile',
   'preferences': 'Preferences',
   'notifications': 'Notifications',
   'security': 'Security & access',
   'connected-accounts': 'Connected accounts',
   'agent-personalization': 'Agent personalization',
};

const WORKSPACE_SETTINGS: Record<string, string> = {
   'workspace': 'General',
   'data-exchange': 'Import and export',
   'archive': 'Archived records',
   'audit': 'Audit log',
   'operations': 'Operations',
};

const SETTINGS: Record<string, string> = {
   'issue-statuses': 'Issue statuses',
   'issue-labels': 'Issue labels',
   'issue-templates': 'Issue templates',
   'slas': 'SLAs',
   'recurring': 'Recurring schedules',
   'project-statuses': 'Project statuses',
   'project-labels': 'Project labels',
   'project-templates': 'Project templates',
   'project-properties': 'Project properties',
   'project-updates': 'Project updates',
   'initiatives': 'Initiatives',
   'documents': 'Documents',
   'releases': 'Releases',
   'customer-requests': 'Customer requests',
   'asks': 'Asks',
   'pulse': 'Pulse',
   'emojis': 'Emojis',
   'ai': 'AI & Agents',
   'ai-operations': 'AI operations',
   'integrations': 'Integrations',
   'code-and-reviews': 'Code & reviews',
   'mcp-logs': 'MCP logs',
   'teams/new': 'New team',
};

const PROJECT_TABS: Record<string, string> = {
   overview: 'Overview',
   issues: 'Issue',
   timeline: 'Timeline',
   docs: 'Docs',
   activity: 'Activity',
};

const TEAM_TABS: Record<string, string> = {
   'overview': 'Overview',
   'all': 'All issues',
   'active': 'Active issues',
   'backlog': 'Backlog',
   'cycles': 'Cycles',
   'cycle/active': 'Active cycle',
   'cycle/upcoming': 'Upcoming cycle',
   'projects': 'Projects',
   'views': 'Views',
   'members': 'Members',
   'documents': 'Documents',
};

const REVIEW_TABS: Record<string, string> = {
   '': 'Overview',
   'review': 'Review',
   'changes': 'Changes',
};

const PUBLIC_PAGES: Record<string, string> = {
   '': 'Home',
   'auth/login': 'Log in',
   'auth/register': 'Register',
   'auth/forgot-password': 'Forgot password',
   'auth/reset-password': 'Reset password',
   'auth/mfa': 'Multi-factor authentication',
   'invitations': 'Workspace invitations',
   'admin': 'Admin',
};

const join = (...parts: (string | undefined)[]) => parts.filter(Boolean).join(' - ');

/**
 * Title of the page at `pathname` (router path, without the deployment base path), without the
 * "| Flowie" suffix. Object names come only from `context.entity`, which the page sets for this
 * path once its own data has loaded, so a slow request of the previous page never names the new
 * one, and nothing private appears before access was checked; until then a generic label is used.
 * Filters, views and query strings never change the title. Undefined for unknown paths, which keep
 * the default "Flowie".
 * VI: Title của trang tại `pathname` (path của router, không gồm base path), chưa có hậu tố
 * VI: "| Flowie". Tên đối tượng chỉ lấy từ `context.entity`, do trang đặt cho đúng path này khi dữ
 * VI: liệu của chính nó đã tải, nên request chậm của trang trước không đặt tên cho trang mới, và
 * VI: không có gì riêng tư hiện ra trước khi kiểm tra quyền; trước đó dùng nhãn chung. Bộ lọc, kiểu
 * VI: hiển thị và query không làm đổi title. Path lạ trả undefined để giữ mặc định "Flowie".
 */
export function pageTitle(pathname: string, context: PageTitleContext = {}): string | undefined {
   const segments = pathname.split('/').filter(Boolean).map(decodeSegment);
   const route = segments.join('/');
   if (route in PUBLIC_PAGES) return PUBLIC_PAGES[route];
   const [, section, key, ...rest] = segments;
   const tail = [key, ...rest].filter(Boolean).join('/');
   const { workspace, entity } = context;
   if (section === undefined) return join(WORKSPACE_PAGES[''], workspace);
   if (section === 'issue' && key) return entity ? `${key} | Issue: ${entity}` : `${key} | Issue`;
   if (section === 'project' && key) {
      const tab = PROJECT_TABS[rest.join('/')];
      return tab ? join(entity ?? 'Project', tab) : undefined;
   }
   if (section === 'team' && key) {
      const tab = TEAM_TABS[rest.join('/')];
      return tab ? join(entity ?? key, tab) : undefined;
   }
   if (section === 'initiative' && key) return join(entity, 'Initiative');
   if (section === 'view' && key) return join(entity, 'View');
   if (section === 'documents' && key) return join(entity, 'Document');
   if (section === 'profiles' && key) return join(entity, 'Profile', workspace);
   if (section === 'review' && key) {
      const tab = REVIEW_TABS[rest.join('/')];
      return tab ? join(entity ?? 'Review', tab) : undefined;
   }
   if (section === 'settings') {
      if (tail in ACCOUNT_SETTINGS) return join(ACCOUNT_SETTINGS[tail], 'Account settings');
      if (tail in WORKSPACE_SETTINGS)
         return join(WORKSPACE_SETTINGS[tail], 'Workspace settings', workspace);
      if (tail in SETTINGS) return join(SETTINGS[tail], 'Settings', workspace);
      if (key === 'teams' && rest.length === 1) return join(entity ?? 'Team', 'Team settings');
      return undefined;
   }
   const page = WORKSPACE_PAGES[[section, key, ...rest].filter(Boolean).join('/')];
   if (page) return join(page, workspace);
   // Other issue list views keep the list's title. VI: Các kiểu xem danh sách issue khác giữ title của danh sách.
   if (section === 'issues') return join(WORKSPACE_PAGES.issues, workspace);
   return undefined;
}

/** The browser tab title: page title plus one "| Flowie". VI: Title tab trình duyệt: title trang cộng một "| Flowie". */
export const documentTitle = (title: string | undefined) =>
   title ? `${title} | Flowie` : 'Flowie';

function decodeSegment(segment: string) {
   try {
      return decodeURIComponent(segment);
   } catch {
      return segment;
   }
}
