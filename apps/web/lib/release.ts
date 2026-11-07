/**
 * Release identity of this bundle, baked in from CHANGELOG.md by next.config.
 * Every value can be empty when the app is built outside the repository, so
 * callers must render nothing rather than a misleading placeholder version.
 */
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? '';

/** Printed verbatim, exactly as the changelog heading states it. */
export const APP_RELEASED_AT = process.env.NEXT_PUBLIC_APP_RELEASED_AT ?? '';

export const CHANGELOG_URL = 'https://github.com/hoangtu0812/Flowie/blob/main/CHANGELOG.md';

function parseNotes(value: string): string[] {
   try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed)
         ? parsed.filter((item): item is string => typeof item === 'string')
         : [];
   } catch {
      return [];
   }
}

/** First entries of the current release, used by the Help menu's "What's new". */
export const APP_HIGHLIGHTS = parseNotes(process.env.NEXT_PUBLIC_APP_HIGHLIGHTS ?? '[]');
export const APP_RELEASE_NOTES = parseNotes(process.env.NEXT_PUBLIC_APP_RELEASE_NOTES ?? '[]');

/** "v0.2.0 · 2026-08-26 19:41 +07", or just the half that is known. */
export function releaseLabel(): string {
   const version = APP_VERSION ? `v${APP_VERSION}` : '';
   return [version, APP_RELEASED_AT].filter(Boolean).join(' · ');
}

/**
 * What the running bundle owes the current account about its release.
 *
 * - `idle`: nothing to do. The bundle names no version, or the account has
 *   already been told about this exact one.
 * - `wait`: the answer is not knowable yet. Account preferences are still
 *   loading, or they failed to load, so the version last seen is unknown.
 * - `adopt`: record this version as seen without showing anything. The account
 *   has no recorded version at all, which is true both of a brand new account
 *   and of every account that existed before this feature shipped. Announcing
 *   to them would interrupt a first sign-in with notes they never missed, and
 *   would greet long-time users with a release they have been using for weeks.
 *   The deliberate cost is that the release introducing this feature announces
 *   itself to nobody; announcements start with the one after it.
 * - `announce`: show the notes once, then record this version as seen.
 *
 * VI: Việc mà bundle đang chạy cần làm với tài khoản hiện tại về bản phát hành.
 *
 * - `idle`: không làm gì. Bundle không có số phiên bản, hoặc tài khoản đã được
 *   thông báo đúng phiên bản này.
 * - `wait`: chưa thể biết câu trả lời. Preferences của tài khoản còn đang tải,
 *   hoặc tải lỗi, nên không biết phiên bản đã xem gần nhất là gì.
 * - `adopt`: ghi nhận phiên bản này là đã xem mà không hiện gì. Tài khoản chưa
 *   có phiên bản nào được ghi nhận, điều đúng với cả tài khoản mới tạo và mọi
 *   tài khoản đã tồn tại trước khi có chức năng này. Thông báo cho họ sẽ chen
 *   vào lần đăng nhập đầu tiên bằng nội dung họ không hề bỏ sót, và sẽ chào
 *   người dùng lâu năm bằng một bản họ đã dùng cả tuần. Cái giá có chủ ý là bản
 *   phát hành mang chính chức năng này không thông báo cho ai; việc thông báo
 *   bắt đầu từ bản kế tiếp.
 * - `announce`: hiện nội dung một lần, rồi ghi nhận phiên bản này là đã xem.
 */
export type ReleaseDecision = 'idle' | 'wait' | 'adopt' | 'announce';

/**
 * Decides whether this account should be told about the running release.
 *
 * Kept a pure function, deliberately outside the store and the React tree, so
 * the rule can be unit tested without a browser. `syncStatus` repeats the
 * preference store's own union rather than importing it: the unit test runner
 * compiles plain modules only, and a status added to the store would fail to
 * type check at the call site instead of being silently ignored here.
 *
 * `version` is empty whenever the bundle was built outside the repository, so
 * every caller must treat that as "say nothing" and never as version zero.
 *
 * VI: Quyết định xem có nên thông báo bản phát hành đang chạy cho tài khoản này
 * hay không.
 *
 * Hàm được giữ thuần, cố ý nằm ngoài store và cây React, để có thể unit test
 * luật này mà không cần trình duyệt. `syncStatus` lặp lại union của store
 * preferences thay vì import: trình chạy unit test chỉ biên dịch module thuần,
 * và một trạng thái mới thêm vào store sẽ báo lỗi type ở chỗ gọi thay vì bị bỏ
 * qua âm thầm ở đây.
 *
 * `version` rỗng mỗi khi bundle được build ngoài repository, nên mọi nơi gọi
 * phải coi đó là "không nói gì", chứ không bao giờ là phiên bản số không.
 */
export function releaseAnnouncement(
   version: string,
   lastSeen: string | null | undefined,
   syncStatus: 'loading' | 'saved' | 'saving' | 'pending' | 'error'
): ReleaseDecision {
   if (!version) return 'idle';
   if (syncStatus === 'loading' || syncStatus === 'error') return 'wait';
   if (!lastSeen) return 'adopt';
   return lastSeen === version ? 'idle' : 'announce';
}
