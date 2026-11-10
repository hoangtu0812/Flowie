"""Read SQL statements of this package, kept in one place for schema review.

VI: Các câu SQL đọc của package này, gom một chỗ để rà khi schema đổi.
"""

from sqlalchemy import TextClause, text


def history_page_select_sql(source, predicate) -> TextClause:
    return text(f"SELECT COUNT(*) FROM {source} WHERE {predicate}")


def history_page_select_sql_2(extra, source, predicate) -> TextClause:
    return text(f"""SELECT h.*,u.id AS person_id,u.name AS person_name,u.avatar_url AS person_avatar {extra}
        FROM {source} WHERE {predicate} ORDER BY h.created_at DESC,h.id DESC LIMIT :limit""")


def history_page_select_projects_sql(project_read_scope) -> TextClause:
    return text(
        f"SELECT 1 FROM projects p WHERE p.id=:entity AND {project_read_scope()}"
    )


HISTORY_PAGE_SELECT_INITIATIVES = text(
    "SELECT 1 FROM initiatives WHERE id=:entity AND workspace_id=:workspace AND archived_at IS NULL"
)


def initiative_page_select_initiatives_sql(predicate) -> TextClause:
    return text("SELECT COUNT(*) FROM initiatives n WHERE " + predicate)


INITIATIVE_PAGE_SELECT_INITIATIVE_LABEL_LINKS = text("""SELECT il.initiative_id,l.id,l.name,l.color FROM initiative_label_links il
        JOIN labels l ON l.id=il.label_id WHERE il.initiative_id=ANY(CAST(:ids AS text[])) AND l.workspace_id=:workspace ORDER BY l.name,l.id""")


def initiative_page_select_initiatives_sql_2(predicate) -> TextClause:
    return text(
        """SELECT n.*,u.name AS owner_name,u.avatar_url AS owner_avatar
        FROM initiatives n LEFT JOIN users u ON u.id=n.owner_id WHERE """
        + predicate
        + " ORDER BY n.created_at DESC,n.id DESC LIMIT :limit"
    )


def initiative_page_select_initiative_projects_sql(project_read_scope) -> TextClause:
    return text(f"""SELECT ip.* FROM initiative_projects ip JOIN projects p ON p.id=ip.project_id
        WHERE ip.initiative_id=ANY(CAST(:ids AS text[])) AND {project_read_scope()} ORDER BY ip.created_at,ip.project_id""")


ACTIVE_MEMBER_SELECT_WORKSPACE_MEMBERS = text("SELECT 1 FROM workspace_members WHERE workspace_id = :workspace_id AND user_id = :user_id AND status = 'ACTIVE'")


INITIATIVE_SELECT_INITIATIVES = text(
    """SELECT initiative.*, owner.id AS owner_id_value, owner.name AS owner_name, owner.avatar_url AS owner_avatar_url
               FROM initiatives initiative LEFT JOIN users owner ON owner.id = initiative.owner_id
               WHERE initiative.id = :initiative_id AND initiative.workspace_id = :workspace_id AND initiative.archived_at IS NULL"""
)


INITIATIVE_SELECT_INITIATIVE_PROJECTS = text('SELECT project_id, created_at FROM initiative_projects WHERE initiative_id = :initiative_id ORDER BY created_at')


INITIATIVE_SELECT_INITIATIVE_LABEL_LINKS = text(
    '''SELECT label.id, label.workspace_id, label.name, label.color, label.description, label.created_at, label.updated_at,
                      initiative_label.created_at AS linked_at
               FROM initiative_label_links initiative_label
               JOIN labels label ON label.id = initiative_label.label_id
               WHERE initiative_label.initiative_id = :initiative_id AND label.workspace_id = :workspace_id
               ORDER BY label.name ASC'''
)


INITIATIVE_SELECT_INITIATIVE_UPDATES = text(
    """SELECT initiative_update.*, author.id AS author_id_value, author.name AS author_name, author.avatar_url AS author_avatar_url
               FROM initiative_updates initiative_update JOIN users author ON author.id = initiative_update.author_id
               WHERE initiative_update.initiative_id = :initiative_id ORDER BY initiative_update.created_at DESC LIMIT 100"""
)


INITIATIVE_SELECT_INITIATIVE_RESOURCES = text(
    """SELECT initiative_resource.*, creator.id AS creator_id_value, creator.name AS creator_name, creator.avatar_url AS creator_avatar_url
               FROM initiative_resources initiative_resource JOIN users creator ON creator.id = initiative_resource.created_by
               WHERE initiative_resource.initiative_id = :initiative_id ORDER BY initiative_resource.created_at ASC"""
)


def link_project_select_projects_sql(project_read_scope) -> TextClause:
    return text(f'SELECT p.id,p.name FROM projects p WHERE p.id=:project_id AND {project_read_scope()}')


LINK_LABEL_SELECT_LABELS = text('SELECT id, name FROM labels WHERE id = :label_id AND workspace_id = :workspace_id')


PROJECT_SUMMARIES_SELECT_PROJECT_LABEL_LINKS = text("""SELECT pl.project_id,l.* FROM project_label_links pl
        JOIN project_labels l ON l.id=pl.label_id WHERE pl.project_id=ANY(CAST(:ids AS text[])) ORDER BY l.name,l.id""")


def project_summaries_select_sql(scope) -> TextClause:
    return text(
        "SELECT i.project_id,lower(s.category::text) AS category,COUNT(*) AS count "
        + scope
        + " AND i.project_id=ANY(CAST(:ids AS text[])) GROUP BY i.project_id,s.category"
    )


def project_page_select_projects_sql(predicate) -> TextClause:
    return text("SELECT COUNT(*) FROM projects p WHERE " + predicate)


def project_summaries_select_project_favorites_sql(project_read_scope) -> TextClause:
    return text(f"""SELECT p.*,t.name AS team_name,t.identifier AS team_identifier,t.icon AS team_icon,
        u.name AS lead_name,u.avatar_url AS lead_avatar,
        EXISTS(SELECT 1 FROM project_favorites f WHERE f.project_id=p.id AND f.user_id=:user) AS favorite
        FROM projects p LEFT JOIN teams t ON t.id=p.team_id LEFT JOIN users u ON u.id=p.lead_id
        WHERE {project_read_scope()} AND p.id=ANY(CAST(:ids AS text[]))""")


def project_page_select_projects_sql_2(predicate) -> TextClause:
    return text(
        "SELECT COUNT(*) FROM projects p WHERE "
        + predicate
        + " AND p.id=:after AND p.manual_order=:rank"
    )


def project_page_select_projects_sql_3(predicate, manual) -> TextClause:
    return text(
        "SELECT p.id,p.created_at,p.manual_order FROM projects p WHERE "
        + predicate
        + (
            " ORDER BY p.manual_order,p.id LIMIT :limit"
            if manual
            else " ORDER BY p.created_at DESC,p.id DESC LIMIT :limit"
        )
    )


LIST_CUSTOM_FIELDS_SELECT_PROJECT_CUSTOM_FIELDS = text('SELECT * FROM project_custom_fields WHERE workspace_id = :workspace_id ORDER BY position ASC, name ASC')


DELETE_CUSTOM_FIELD_SELECT_PROJECT_CUSTOM_FIELDS = text('SELECT 1 FROM project_custom_fields WHERE id = :id AND workspace_id = :workspace_id')


LIST_PROJECT_LABELS_SELECT_PROJECT_LABELS = text('''SELECT l.*, COUNT(pl.project_id)::integer AS project_count
                FROM project_labels l LEFT JOIN project_label_links pl ON pl.label_id = l.id
                WHERE l.workspace_id = :workspace_id
                GROUP BY l.id ORDER BY l.name ASC''')


DELETE_PROJECT_LABEL_SELECT_PROJECT_LABELS = text('SELECT 1 FROM project_labels WHERE id = :id AND workspace_id = :workspace_id')


PROJECT_STATUSES_SELECT_PROJECT_STATUSES = text('''SELECT s.*, COUNT(p.id)::integer AS project_count
                FROM project_statuses s LEFT JOIN projects p ON p.workspace_id = s.workspace_id
                   AND p.status = s.name AND p.archived_at IS NULL
                WHERE s.workspace_id = :workspace_id
                GROUP BY s.id ORDER BY s.category ASC, s.position ASC, s.name ASC''')


DELETE_PROJECT_STATUS_SELECT_PROJECTS = text('SELECT COUNT(*) FROM projects WHERE workspace_id = :workspace_id AND status = :status AND archived_at IS NULL')


LIST_PROJECT_TEMPLATES_SELECT_PROJECT_TEMPLATES = text('SELECT * FROM project_templates WHERE workspace_id = :workspace_id ORDER BY name ASC')


UPDATE_PROJECT_TEMPLATE_SELECT_PROJECT_TEMPLATES = text('SELECT 1 FROM project_templates WHERE id = :id AND workspace_id = :workspace_id')


DELETE_PROJECT_TEMPLATE_SELECT_PROJECT_TEMPLATES = text('SELECT 1 FROM project_templates WHERE id = :id AND workspace_id = :workspace_id')


PROJECT_CUSTOM_FIELDS_SELECT_PROJECT_CUSTOM_FIELDS = text('''SELECT f.*, v.value FROM project_custom_fields f
                LEFT JOIN project_custom_field_values v ON v.field_id = f.id AND v.project_id = :project_id
                WHERE f.workspace_id = :workspace_id ORDER BY f.position ASC, f.name ASC''')


MEMBERS_SELECT_PROJECT_MEMBERS = text('''SELECT pm.project_id, pm.user_id, pm.created_at, u.id, u.name, u.avatar_url FROM project_members pm JOIN users u ON u.id = pm.user_id WHERE pm.project_id = :project_id ORDER BY pm.created_at''')


ACTIVITY_SELECT_ACTIVITIES = text('''SELECT a.*, u.id AS actor_id_value, u.name AS actor_name, u.avatar_url AS actor_avatar_url FROM activities a LEFT JOIN users u ON u.id = a.actor_id WHERE a.project_id = :project_id ORDER BY a.created_at DESC LIMIT 100''')


PROJECT_SELECT_ISSUES = text('''SELECT p.*, t.id AS team_id_value, t.name AS team_name, t.identifier AS team_identifier, t.icon AS team_icon, u.id AS lead_id_value, u.name AS lead_name, u.avatar_url AS lead_avatar_url, (SELECT COUNT(*) FROM issues i WHERE i.project_id = p.id) AS issue_count, EXISTS(SELECT 1 FROM project_favorites f WHERE f.project_id = p.id AND f.user_id = :user_id) AS is_favorite FROM projects p LEFT JOIN teams t ON t.id = p.team_id LEFT JOIN users u ON u.id = p.lead_id WHERE p.id = :project_id AND p.workspace_id = :workspace_id AND p.archived_at IS NULL LIMIT 1''')


PROJECT_SELECT_PROJECT_LABEL_LINKS = text('''SELECT l.* FROM project_label_links pl JOIN project_labels l ON l.id = pl.label_id WHERE pl.project_id = :project_id ORDER BY l.name''')


PROJECT_SELECT_PROJECT_RESOURCES = text('''SELECT r.*, u.id AS creator_id_value, u.name AS creator_name, u.avatar_url AS creator_avatar_url FROM project_resources r JOIN users u ON u.id = r.created_by WHERE r.project_id = :project_id ORDER BY r.created_at''')


PROJECT_SELECT_INITIATIVE_PROJECTS = text('''SELECT ip.initiative_id, ip.project_id, ip.created_at, i.id, i.name FROM initiative_projects ip JOIN initiatives i ON i.id = ip.initiative_id WHERE ip.project_id = :project_id''')


PROJECT_SELECT_ISSUES_2 = text('''SELECT i.id, i.identifier, i.title, i.priority, i.updated_at, s.id AS status_id_value, s.name AS status_name, s.category AS status_category, s.color AS status_color, a.id AS assignee_id_value, a.name AS assignee_name, a.avatar_url AS assignee_avatar_url FROM issues i JOIN issue_statuses s ON s.id = i.status_id LEFT JOIN users a ON a.id = i.assignee_id WHERE i.project_id = :project_id AND i.archived_at IS NULL AND (i.team_id IS NULL OR EXISTS(SELECT 1 FROM team_members tm JOIN teams scoped_team ON scoped_team.id=tm.team_id WHERE tm.team_id=i.team_id AND tm.user_id=:user_id AND scoped_team.archived_at IS NULL)) ORDER BY i.updated_at DESC''')


PROJECT_ISSUE_ROWS_SELECT_ISSUES = text(
    """SELECT i.*,
                      s.id AS status_id_value, s.name AS status_name, s.category AS status_category, s.color AS status_color,
                      s.position AS status_position,
                      t.id AS team_id_value, t.name AS team_name, t.identifier AS team_identifier,
                      c.id AS creator_id_value, c.name AS creator_name, c.avatar_url AS creator_avatar_url,
                      a.id AS assignee_id_value, a.name AS assignee_name, a.avatar_url AS assignee_avatar_url
               FROM issues i
               JOIN issue_statuses s ON s.id = i.status_id
               LEFT JOIN teams t ON t.id = i.team_id
               JOIN users c ON c.id = i.creator_id
               LEFT JOIN users a ON a.id = i.assignee_id
               WHERE i.project_id = :project_id AND i.workspace_id = :workspace_id AND i.archived_at IS NULL
               AND t.archived_at IS NULL AND (i.team_id IS NULL OR EXISTS(SELECT 1 FROM team_members tm WHERE tm.team_id=i.team_id AND tm.user_id=:user_id))
               ORDER BY i.updated_at DESC"""
)


PROJECT_ISSUE_ROWS_SELECT_ISSUE_LABELS = text(
    """SELECT il.issue_id, il.label_id, il.created_at, l.name, l.color
               FROM issue_labels il JOIN labels l ON l.id = il.label_id
               WHERE il.issue_id = ANY(:issue_ids) ORDER BY l.name"""
)


PROJECT_ISSUE_ROWS_SELECT_ISSUE_CYCLES = text(
    """SELECT ic.issue_id, ic.cycle_id, ic.created_at, cy.name
               FROM issue_cycles ic JOIN cycles cy ON cy.id = ic.cycle_id
               WHERE ic.issue_id = ANY(:issue_ids) ORDER BY ic.created_at"""
)


UPDATE_PROJECT_CUSTOM_FIELD_SELECT_PROJECT_CUSTOM_FIELDS = text('SELECT * FROM project_custom_fields WHERE id = :id AND workspace_id = :workspace_id')


SUBSCRIPTION_SELECT_PROJECT_SUBSCRIPTIONS = text('SELECT created_at FROM project_subscriptions WHERE project_id = :project_id AND user_id = :user_id')


SUBSCRIBE_SELECT_PROJECT_SUBSCRIPTIONS = text('SELECT created_at FROM project_subscriptions WHERE project_id = :project_id AND user_id = :user_id')


FAVORITE_SELECT_PROJECT_FAVORITES = text('SELECT created_at FROM project_favorites WHERE project_id = :project_id AND user_id = :user_id')


LIST_MILESTONES_SELECT_PROJECT_MILESTONES = text('SELECT * FROM project_milestones WHERE project_id = :project_id AND workspace_id = :workspace_id ORDER BY position, target_date')


CREATE_MILESTONE_SELECT_PROJECT_MILESTONES = text('SELECT * FROM project_milestones WHERE id = :id')


UPDATE_MILESTONE_SELECT_PROJECT_MILESTONES = text('SELECT 1 FROM project_milestones WHERE id = :id AND project_id = :project_id AND workspace_id = :workspace_id')


UPDATE_MILESTONE_SELECT_PROJECT_MILESTONES_2 = text('SELECT * FROM project_milestones WHERE id = :id')


PROJECT_SELECT_TEAMS = text('SELECT * FROM teams WHERE id = :team_id')


UPDATE_PROJECT_SELECT_WORKSPACE_MEMBERS = text("SELECT 1 FROM workspace_members WHERE workspace_id = :workspace_id AND user_id = :user_id AND status = 'ACTIVE'")


UPDATE_PROJECT_SELECT_PROJECT_STATUSES = text('SELECT 1 FROM project_statuses WHERE workspace_id = :workspace_id AND name = :name')


UPDATE_MEMBERS_SELECT_WORKSPACE_MEMBERS = text("SELECT COUNT(*) FROM workspace_members WHERE workspace_id = :workspace_id AND status = 'ACTIVE' AND user_id = ANY(:user_ids)")


UPDATE_PROJECT_LABEL_SELECT_PROJECT_LABELS = text('SELECT 1 FROM project_labels WHERE id = :id AND workspace_id = :workspace_id')


UPDATE_PROJECT_SELECT_PROJECT_LABELS = text('SELECT COUNT(*) FROM project_labels WHERE workspace_id = :workspace_id AND id = ANY(:ids)')


CREATE_CUSTOM_FIELD_SELECT_PROJECT_CUSTOM_FIELDS = text('SELECT * FROM project_custom_fields WHERE id = :id')


UPDATE_CUSTOM_FIELD_SELECT_PROJECT_CUSTOM_FIELDS = text('SELECT * FROM project_custom_fields WHERE id = :id AND workspace_id = :workspace_id')


UPDATE_CUSTOM_FIELD_SELECT_PROJECT_CUSTOM_FIELDS_2 = text('SELECT * FROM project_custom_fields WHERE id = :id')


CREATE_PROJECT_LABEL_SELECT_PROJECT_LABELS = text('''SELECT l.*, 0::integer AS project_count FROM project_labels l WHERE l.id = :id''')


UPDATE_PROJECT_LABEL_SELECT_PROJECT_LABELS_2 = text('''SELECT l.*, COUNT(pl.project_id)::integer AS project_count FROM project_labels l LEFT JOIN project_label_links pl ON pl.label_id = l.id WHERE l.id = :id GROUP BY l.id''')


CREATE_PROJECT_STATUS_SELECT_PROJECT_STATUSES = text('''SELECT s.*, 0::integer AS project_count FROM project_statuses s WHERE s.id = :id''')


UPDATE_PROJECT_STATUS_SELECT_PROJECT_STATUSES = text('SELECT * FROM project_statuses WHERE id = :id AND workspace_id = :workspace_id')


UPDATE_PROJECT_STATUS_SELECT_PROJECT_STATUSES_2 = text('''SELECT s.*, COUNT(p.id)::integer AS project_count FROM project_statuses s LEFT JOIN projects p ON p.workspace_id = s.workspace_id AND p.status = s.name AND p.archived_at IS NULL WHERE s.id = :id GROUP BY s.id''')


DELETE_PROJECT_STATUS_SELECT_PROJECT_STATUSES = text('SELECT name FROM project_statuses WHERE id = :id AND workspace_id = :workspace_id')


CREATE_PROJECT_TEMPLATE_SELECT_PROJECT_TEMPLATES = text('SELECT * FROM project_templates WHERE id = :id')


UPDATE_PROJECT_TEMPLATE_SELECT_PROJECT_TEMPLATES_2 = text('SELECT * FROM project_templates WHERE id = :id')


RESOLVE_PROJECT_SELECT_PROJECTS = text('''SELECT p.id, p.slug, p.team_id FROM projects p
        WHERE p.workspace_id = :workspace_id AND p.archived_at IS NULL
          AND (p.id = :key OR p.id = (SELECT s.project_id FROM project_slugs s WHERE s.workspace_id = :workspace_id AND s.slug = lower(:key)))
        ORDER BY p.id = :key DESC LIMIT 1''')


CREATE_PROJECT_SELECT_PROJECT_TEMPLATES = text('SELECT * FROM project_templates WHERE id = :id AND workspace_id = :workspace_id')
