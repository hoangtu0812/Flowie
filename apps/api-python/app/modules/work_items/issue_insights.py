from sqlalchemy import text

from ...core.errors import ApiError
from ..access.project_scope import project_read_scope
from .issue_search import issue_scope

DIMENSIONS = {
    'status': ("s.id", "s.name", "s.color", "NULL::text"),
    'priority': ("CASE WHEN i.priority='NONE' THEN 'no-priority' ELSE lower(i.priority::text) END", "CASE WHEN i.priority='NONE' THEN 'No priority' ELSE initcap(lower(i.priority::text)) END", "NULL::text", "NULL::text"),
    'assignee': ("COALESCE(a.id,'unassigned')", "COALESCE(a.name,'Unassigned')", "NULL::text", "a.avatar_url"),
    'project': ("COALESCE(p.id,'no-project')", "COALESCE(p.name,'No project')", "NULL::text", "NULL::text"),
}


async def issue_insights(db, workspace, user, options, slice_by, segment_by):
    if slice_by not in DIMENSIONS or segment_by not in DIMENSIONS:
        raise ApiError(400,'Unsupported report dimension.','Bad Request')
    sql, params = issue_scope(workspace,user,options)
    joins = f' LEFT JOIN users a ON a.id=i.assignee_id LEFT JOIN projects p ON p.id=i.project_id AND {project_read_scope()} '
    sql = sql.replace(' WHERE ', joins+' WHERE ',1)
    expressions = [f'{expression} AS {prefix}_{field}' for prefix,dimension in [('slice',slice_by),('segment',segment_by)] for field,expression in zip(['id','label','color','avatar'],DIMENSIONS[dimension])]
    cells = (await db.execute(text('SELECT '+','.join(expressions)+',COUNT(*) AS count '+sql+' GROUP BY 1,2,3,4,5,6,7,8 ORDER BY 1,5 LIMIT 1001'),params)).mappings().all()
    if len(cells)>1000:
        raise ApiError(400,'Too many report groups. Narrow the filters.','Bad Request')

    def value(cell,prefix,dimension):
        result={'id':dimension+':'+cell[prefix+'_id'],'label':cell[prefix+'_label'],'filterValue':cell[prefix+'_id'],'color':cell[prefix+'_color']}
        if dimension=='assignee':
            result['avatarUrl']=cell[prefix+'_avatar']
        return result

    rows,segments,total = {},{},0
    for cell in cells:
        slice_value,segment = value(cell,'slice',slice_by),value(cell,'segment',segment_by)
        segments[segment['id']]=segment
        row=rows.setdefault(slice_value['id'],{'value':slice_value,'total':0,'bySegment':{}})
        row['total']+=cell['count']
        row['bySegment'][segment['id']]=cell['count']
        total+=cell['count']
    return {'total':total,'rows':list(rows.values()),'segments':list(segments.values())}
