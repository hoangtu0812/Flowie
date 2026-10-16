# Issue list actions

List actions use the existing header toolbar. The **Issue actions** (three-dot)
menu contains **Bulk changes** and **Export matching issues CSV** for team,
cycle, personal, member, project and saved issue views. Team issue lists also
provide **Bug report**, which opens an on-demand dialog covering accessible
team bugs by severity and workflow category; its scope is the team, independent
of list filters. Project AI scheduling shares the project toolbar.

`features/issues/issue-list-actions.tsx` owns the menu and dialog visibility.
Account, workspace, route and query changes reset the controls. Bulk previews,
confirmation, conflict checking and durable operation history remain in
`bulk-issue-actions.tsx`; CSV downloading is isolated in
`features/data-exchange/use-issue-export.ts` and uses the same server query and
current access as before. Export failures use a recoverable notification.

`GroupedIssuesView` owns pagination for both lists and boards; search results
have their own pagination owner. Parents must not add pagination or command
strips above these views. A footer appears only for another page or a page
error; completed lists start directly below the toolbar and applied filters.
The team issue header and pagination use server totals; partial loading remains
explicit. Cycle menus stay hidden while the cycle is unresolved, unavailable
or absent, so commands cannot target the previously loaded list. After a
report or bulk dialog closes, keyboard focus returns to the persistent menu
trigger because its original menu item is no longer mounted. The toolbar
opens native dialogs after the menu focus scope closes, so its invisible closing
layer cannot intercept Escape before the dialog. An explicit autofocus title
region prevents native focus from opening the close-button tooltip and consuming
the first Escape press. Browser pagination checks wait for real cursor responses
and settled counts rather than temporary loading text.

Browser coverage in `issue-toolbar.spec.ts` checks keyboard focus restoration,
report error/retry and team scope, mobile menu bounds, project entry points,
and real server cursor pagination using a smaller page size. Existing bulk and
CSV tests exercise their menu entry points and persisted results/downloads.
No database, API or production configuration change is required.
