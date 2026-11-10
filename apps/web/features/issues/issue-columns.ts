import { useMemo } from 'react';
import {
   DEFAULT_DISPLAY_PROPERTIES,
   useDisplaySettingsStore,
   type DisplayPropertyKey,
} from '@/store/display-settings-store';
import { useUiPreferencesStore, type StoredIssueColumns } from '@/store/ui-preferences-store';

/**
 * Columns after the title, in their default order. The title (with the ID,
 * status and priority it carries) always comes first and cannot be moved or
 * hidden, so it is not one of these.
 * VI: Các cột sau Title, theo thứ tự mặc định. Title (kèm ID, status và
 * priority bên trong) luôn đứng đầu, không di chuyển hay ẩn được, nên không
 * nằm trong danh sách này.
 */
export const ISSUE_COLUMN_KEYS = [
   'labels',
   'project',
   'startDate',
   'targetDate',
   'estimatedEffort',
   'actualEffort',
   'cycle',
   'created',
   'dueDate',
   'assignee',
] as const satisfies readonly DisplayPropertyKey[];

export type IssueColumnKey = (typeof ISSUE_COLUMN_KEYS)[number];
export type IssueColumnWidthKey = IssueColumnKey | 'title';

/** Display properties drawn inside the title cell. VI: Thuộc tính hiển thị nằm trong ô Title. */
export const TITLE_PROPERTIES = [
   { key: 'id', label: 'ID' },
   { key: 'status', label: 'Status' },
   { key: 'priority', label: 'Priority' },
] as const satisfies readonly { key: DisplayPropertyKey; label: string }[];

export const ISSUE_COLUMN_LABEL = {
   labels: 'Labels',
   project: 'Project',
   startDate: 'Start',
   targetDate: 'End',
   estimatedEffort: 'Est. effort',
   actualEffort: 'Act. effort',
   cycle: 'Cycle',
   created: 'Created',
   dueDate: 'Due date',
   assignee: 'Assignee',
} as const satisfies Record<IssueColumnKey, string>;

/**
 * Responsive visibility and layout of each column, shared by the header and
 * every row so the labels can never drift from their cells. Widths are not
 * here: they come from the account's column settings as an inline style.
 * VI: Cách hiện theo kích thước màn hình và bố cục của từng cột, dùng chung
 * cho header và mọi dòng để nhãn không bao giờ lệch khỏi ô. Độ rộng không nằm
 * ở đây: nó lấy từ cấu hình cột của tài khoản dưới dạng inline style.
 */
export const ISSUE_COLUMN: Record<IssueColumnKey, string> = {
   labels: 'hidden lg:flex items-center gap-1 shrink-0 pl-2 overflow-hidden',
   project: 'hidden xl:flex items-center shrink-0 pl-2 overflow-hidden',
   startDate: 'hidden xl:flex items-center shrink-0 pl-2 overflow-hidden',
   targetDate: 'hidden xl:flex items-center shrink-0 pl-2 overflow-hidden',
   estimatedEffort: 'hidden xl:flex items-center shrink-0 pl-2 overflow-hidden',
   actualEffort: 'hidden xl:flex items-center shrink-0 pl-2 overflow-hidden',
   cycle: 'hidden xl:flex items-center shrink-0 pl-2 overflow-hidden',
   created: 'hidden sm:flex items-center shrink-0 pl-2 overflow-hidden',
   dueDate: 'hidden sm:flex items-center shrink-0 pl-2 overflow-hidden',
   assignee: 'flex items-center shrink-0 pl-2 overflow-hidden',
};

const DEFAULT_WIDTHS: Record<IssueColumnWidthKey, number> = {
   title: 320,
   labels: 160,
   project: 120,
   startDate: 82,
   targetDate: 82,
   estimatedEffort: 112,
   actualEffort: 112,
   cycle: 90,
   created: 80,
   dueDate: 90,
   assignee: 70,
};

/**
 * Width limits in px. The title is a minimum width: it still grows into free
 * space, so a long title shows in full whenever the screen allows. The API
 * accepts 40–2000, so these always fit what it stores.
 * VI: Giới hạn độ rộng px. Với Title đây là độ rộng tối thiểu: ô vẫn giãn vào
 * khoảng trống, nên tiêu đề dài hiện đủ khi màn hình cho phép. API chấp nhận
 * 40–2000, nên các giới hạn này luôn nằm trong khoảng nó lưu được.
 */
export const issueColumnWidthLimit = (key: IssueColumnWidthKey) =>
   key === 'title' ? { min: 200, max: 1000 } : { min: 60, max: 480 };

export const clampIssueColumnWidth = (key: IssueColumnWidthKey, width: number) => {
   const { min, max } = issueColumnWidthLimit(key);
   return Math.round(Math.min(max, Math.max(min, width)));
};

export interface IssueColumns {
   visible: Record<DisplayPropertyKey, boolean>;
   order: IssueColumnKey[];
   widths: Record<IssueColumnWidthKey, number>;
}

const isColumnKey = (key: string): key is IssueColumnKey =>
   (ISSUE_COLUMN_KEYS as readonly string[]).includes(key);

/**
 * Turns what the account stored into a complete column set. Unknown keys are
 * dropped, columns the stored order lacks (for example ones a later release
 * added) are appended in default order, and widths are clamped. Before the
 * account has saved anything, visibility comes from the per-browser Display
 * settings so earlier choices are not lost.
 * VI: Chuyển dữ liệu tài khoản đã lưu thành bộ cột đầy đủ. Khoá lạ bị bỏ, cột
 * mà thứ tự đã lưu thiếu (ví dụ cột bản sau mới thêm) được nối vào theo thứ tự
 * mặc định, và độ rộng được kẹp trong giới hạn. Khi tài khoản chưa lưu gì, trạng
 * thái ẩn/hiện lấy từ Display settings của trình duyệt để không mất lựa chọn cũ.
 */
export function resolveIssueColumns(
   stored: StoredIssueColumns | null,
   legacyVisible: Record<DisplayPropertyKey, boolean> = DEFAULT_DISPLAY_PROPERTIES
): IssueColumns {
   const source: Record<string, unknown> = stored?.visible ?? legacyVisible ?? {};
   const visible = { ...DEFAULT_DISPLAY_PROPERTIES };
   for (const key of Object.keys(visible) as DisplayPropertyKey[]) {
      const value = source[key];
      if (typeof value === 'boolean') visible[key] = value;
   }
   const order = [...new Set((stored?.order ?? []).filter(isColumnKey))];
   for (const key of ISSUE_COLUMN_KEYS) if (!order.includes(key)) order.push(key);
   const widths = { ...DEFAULT_WIDTHS };
   for (const key of Object.keys(widths) as IssueColumnWidthKey[]) {
      const value = stored?.widths[key];
      if (typeof value === 'number' && Number.isFinite(value))
         widths[key] = clampIssueColumnWidth(key, value);
   }
   return { visible, order, widths };
}

/** The resolved columns of the signed-in account. VI: Bộ cột đã resolve của tài khoản đang đăng nhập. */
export function useIssueColumns() {
   const stored = useUiPreferencesStore((state) => state.issueColumns);
   const legacy = useDisplaySettingsStore((state) => state.displayProperties);
   return useMemo(() => resolveIssueColumns(stored, legacy), [stored, legacy]);
}

// Every change writes the whole resolved set: the preference document merges
// only at its top level, so a partial object would erase the other fields.
// VI: Mỗi thay đổi ghi toàn bộ bộ cột đã resolve: document preferences chỉ
// merge ở cấp ngoài cùng, nên object thiếu field sẽ xoá các field còn lại.
function updateIssueColumns(change: (columns: IssueColumns) => IssueColumns) {
   const preferences = useUiPreferencesStore.getState();
   const current = resolveIssueColumns(
      preferences.issueColumns,
      useDisplaySettingsStore.getState().displayProperties
   );
   preferences.setIssueColumns(change(current));
}

export const setIssueColumnVisible = (key: DisplayPropertyKey, visible: boolean) =>
   updateIssueColumns((columns) => ({
      ...columns,
      visible: { ...columns.visible, [key]: visible },
   }));

export const moveIssueColumn = (from: number, to: number) =>
   updateIssueColumns((columns) => {
      const order = [...columns.order];
      const [moved] = order.splice(from, 1);
      if (moved) order.splice(to, 0, moved);
      return { ...columns, order };
   });

export const resizeIssueColumn = (key: IssueColumnWidthKey, width: number) =>
   updateIssueColumns((columns) => ({
      ...columns,
      widths: { ...columns.widths, [key]: clampIssueColumnWidth(key, width) },
   }));

/**
 * Stores the defaults explicitly rather than clearing to null, so the legacy
 * per-browser visibility cannot come back after a reset.
 * VI: Lưu tường minh giá trị mặc định thay vì xoá về null, để trạng thái ẩn/hiện
 * cũ của trình duyệt không quay lại sau khi Reset.
 */
export const resetIssueColumns = () =>
   useUiPreferencesStore.getState().setIssueColumns(resolveIssueColumns(null));

/**
 * The title cell contains the status controls and needs a usable minimum
 * width. When a side panel reduces the list viewport, the list scrolls as one
 * table instead of letting the flexible title cell collapse under Labels.
 * VI: Ô Title chứa các control trạng thái và cần độ rộng tối thiểu dùng được.
 * Khi panel bên thu hẹp vùng danh sách, cả bảng cuộn ngang thay vì để ô Title
 * co lại nằm dưới cột Labels.
 */
export const issueListMinWidth = ({ visible, order, widths }: IssueColumns) =>
   48 +
   widths.title +
   order.reduce((width, column) => width + (visible[column] ? widths[column] : 0), 0);
