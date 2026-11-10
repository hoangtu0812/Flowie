'use client';

import { TimelineFrame } from '@/components/common/timeline/timeline-frame';
import { TimelineIssueBar } from '@/components/common/timeline/timeline-issue-bar';
import { barGeometry, dayWidthOf } from '@/components/common/timeline/timeline-scale';
import { issueSpan, type ScheduledIssue } from '@/lib/issue-span';
import { cn } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import { ChevronRight, TriangleAlert } from 'lucide-react';

/** An issue drawn on the sub-issue timeline. VI: Một issue vẽ trên timeline sub-issue. */
export type TimelineSubIssue = ScheduledIssue & {
   id: string;
   identifier: string;
   title: string;
   status: { color: string };
};

/** One visible row: the open issue (depth -1) or a sub-issue at its tree depth.
 * VI: Một hàng hiển thị: issue đang mở (depth -1) hoặc sub-issue ở độ sâu của nó trong cây. */
export type TimelineSubIssueRow = {
   issue: TimelineSubIssue;
   depth: number;
   hasChildren: boolean;
   open: boolean;
   outside: boolean;
};

const ROW_HEIGHT = 32;
// Toolbar, scale, bottom padding and the horizontal scrollbar around the rows.
// VI: Thanh công cụ, thang ngày, khoảng đệm dưới và thanh cuộn ngang quanh các hàng.
const FRAME_CHROME = 130;
const MAX_HEIGHT = 480;

const rangeLabel = (issue: ScheduledIssue) => {
   const { start, end } = issueSpan(issue);
   const startLabel = format(parseISO(start), 'MMM d');
   return end && end !== start ? `${startLabel} – ${format(parseISO(end), 'MMM d')}` : startLabel;
};

/**
 * Timeline mode of the issue-detail Sub-issues section. Rows arrive already ordered and filtered
 * by the section (its saved sort and collapsed branches), so this only draws them: a sticky label
 * column with the expand toggle and a bar per row on the shared scale. The first row is the open
 * issue itself. Bars of a sub-issue outside the open issue's dates get the amber outline. When
 * `onReschedule` is given, bars can be dragged; it resolves true once saved. Clicking a bar opens
 * the issue. The frame grows with the rows up to 480 px, then scrolls.
 * VI: Chế độ Timeline của khu Sub-issues trong chi tiết issue. Các hàng đã được khu Sub-issues sắp
 * VI: và lọc sẵn (theo sort đã lưu và các nhánh đang thu), nên component chỉ vẽ: cột nhãn sticky có
 * VI: nút mở/thu và một thanh mỗi hàng trên thang dùng chung. Hàng đầu là chính issue đang mở.
 * VI: Thanh của sub-issue nằm ngoài khoảng ngày của issue đang mở có viền cam. Có `onReschedule`
 * VI: thì thanh kéo được; hàm trả true khi đã lưu. Bấm thanh mở issue. Khung cao theo số hàng tới
 * VI: 480 px rồi cuộn.
 */
export function IssueSubIssuesTimeline({
   rows,
   parentIdentifier,
   onToggle,
   onOpen,
   onReschedule,
}: {
   rows: TimelineSubIssueRow[];
   parentIdentifier: string;
   onToggle: (id: string) => void;
   onOpen: (issue: TimelineSubIssue) => void;
   onReschedule?: (issue: TimelineSubIssue, start: string, end: string | null) => Promise<boolean>;
}) {
   const focus = rows[0] ? issueSpan(rows[0].issue).start : undefined;
   return (
      <div style={{ height: Math.min(rows.length * ROW_HEIGHT + FRAME_CHROME, MAX_HEIGHT) }}>
         <TimelineFrame defaultZoom="month" focusIso={focus} className="h-full rounded-md border">
            {(monthWidth) => (
               <>
                  {rows.map(({ issue, depth, hasChildren, open, outside }) => {
                     const { start, end } = issueSpan(issue);
                     const { left, width } = barGeometry(start, end, monthWidth);
                     return (
                        <div
                           key={issue.id}
                           className="relative h-8 flex items-center"
                           data-testid="sub-issue-timeline-row"
                        >
                           <TimelineIssueBar
                              left={left}
                              width={width}
                              color={issue.status.color}
                              dashed={!end}
                              title={issue.title}
                              label={`${issue.identifier} · ${issue.title} — ${rangeLabel(issue)}${outside ? ` — outside ${parentIdentifier}'s dates` : ''}`}
                              warning={outside}
                              onClick={() => onOpen(issue)}
                              schedule={
                                 onReschedule
                                    ? {
                                         start,
                                         end,
                                         monthWidth,
                                         dayWidth: dayWidthOf(monthWidth),
                                         onChange: (nextStart, nextEnd) =>
                                            onReschedule(issue, nextStart, nextEnd),
                                      }
                                    : undefined
                              }
                           />
                           <div
                              className={cn(
                                 'sticky left-0 z-10 flex items-center gap-1.5 w-60 shrink-0 pr-3 h-8 bg-container/95 backdrop-blur-sm text-xs border-r border-border/40',
                                 depth < 0 && 'font-semibold'
                              )}
                              style={{ paddingLeft: 8 + Math.max(depth + 1, 0) * 16 }}
                           >
                              {hasChildren && depth >= 0 ? (
                                 <button
                                    type="button"
                                    onClick={() => onToggle(issue.id)}
                                    aria-expanded={open}
                                    aria-label={`${open ? 'Collapse' : 'Expand'} ${issue.identifier}`}
                                    className="text-muted-foreground hover:text-foreground"
                                 >
                                    <ChevronRight
                                       className={cn(
                                          'size-3.5 transition-transform',
                                          open && 'rotate-90'
                                       )}
                                    />
                                 </button>
                              ) : (
                                 <span className="size-3.5 shrink-0" aria-hidden="true" />
                              )}
                              <span className="text-muted-foreground shrink-0">
                                 {issue.identifier}
                              </span>
                              <span className="truncate flex-1">{issue.title}</span>
                              {outside && (
                                 <TriangleAlert
                                    className="size-3.5 shrink-0 text-amber-500"
                                    aria-label={`Outside ${parentIdentifier}'s dates`}
                                 />
                              )}
                           </div>
                        </div>
                     );
                  })}
               </>
            )}
         </TimelineFrame>
      </div>
   );
}
