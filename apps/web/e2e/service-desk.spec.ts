import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const fixture = JSON.parse(readFileSync('.e2e-fixture.json', 'utf8')) as {
   slug: string;
   workspace_id: string;
   email: string;
   password: string;
   deskRequesterEmail: string;
   projectId: string;
};
const api = 'http://localhost:4000/api/v1';
const query = `workspaceId=${fixture.workspace_id}`;

async function signIn(
   browser: Browser,
   email: string,
   viewport?: { width: number; height: number }
) {
   const context = await browser.newContext(viewport ? { viewport } : undefined);
   const page = await context.newPage();
   await page.goto('/auth/login');
   await page.getByLabel('Email', { exact: true }).fill(email);
   await page.getByLabel('Password', { exact: true }).fill(fixture.password);
   await page.getByRole('button', { name: 'Sign in', exact: true }).click();
   await expect(page).toHaveURL(
      new RegExp(email === fixture.deskRequesterEmail ? '/servicedesk' : `/${fixture.slug}/`)
   );
   return { context, page };
}

const setServiceDesk = async (context: BrowserContext, enabled: boolean) => {
   const response = await context.request.patch(`${api}/projects/${fixture.projectId}?${query}`, {
      data: { serviceDeskEnabled: enabled },
   });
   expect(response.ok(), await response.text()).toBeTruthy();
};

async function openDesk(page: Page) {
   await page.goto(`/${fixture.slug}/service-desk`);
   await expect(page.getByRole('button', { name: 'New ticket', exact: true })).toBeEnabled();
}

// A requester outside the team raises a ticket and follows it; the team answers and converts it.
// VI: Người yêu cầu ngoài team tạo và theo dõi ticket; team trả lời và chuyển ticket thành Issue.
test('a requester outside the team follows a ticket the team answers and converts', async ({
   browser,
}) => {
   const team = await signIn(browser, fixture.email);
   const requester = await signIn(browser, fixture.deskRequesterEmail);
   const title = `Service Desk spec ${Date.now()}`;
   await setServiceDesk(team.context, true);
   try {
      // The page may have listed projects before the switch was turned on.
      // VI: Trang có thể đã tải danh sách dự án trước khi bật công tắc.
      await requester.page.reload();
      await expect(requester.page.getByRole('button', { name: 'New ticket' })).toBeEnabled();
      await expect(requester.page.getByRole('link', { name: 'Dashboard' })).toHaveCount(0);
      await expect(requester.page).toHaveTitle(/Service Desk/);
      await expect(requester.page.getByRole('tab', { name: /Queue/ })).toHaveCount(0);
      await requester.page.getByRole('button', { name: 'New ticket', exact: true }).click();
      await requester.page.getByLabel('Title', { exact: true }).fill(title);
      await requester.page.getByLabel('Description', { exact: true }).fill('It fails on mobile');
      await requester.page.getByLabel('Attachments', { exact: true }).setInputFiles({
         name: 'steps.txt',
         mimeType: 'text/plain',
         buffer: Buffer.from('Steps to reproduce'),
      });
      await requester.page.getByRole('button', { name: 'Create ticket', exact: true }).click();
      await expect(requester.page.getByRole('dialog')).toHaveCount(0);
      await expect(requester.page.getByRole('link', { name: 'steps.txt' })).toBeVisible();
      await expect(requester.page.getByText('It fails on mobile')).toBeVisible();
      await expect(requester.page.getByRole('button', { name: 'Convert to issue' })).toHaveCount(0);
      await expect(requester.page.getByRole('button', { name: 'Decline' })).toHaveCount(0);
      await requester.page.reload();
      await requester.page.getByText(title, { exact: true }).first().click();
      await expect(requester.page.getByRole('link', { name: 'steps.txt' })).toBeVisible();

      await openDesk(team.page);
      await team.page.getByRole('tab', { name: /Queue/ }).click();
      await team.page.getByText(title, { exact: true }).first().click();
      await expect(team.page.getByRole('link', { name: 'steps.txt' })).toBeVisible();
      await team.page.getByRole('textbox', { name: 'Write a reply' }).fill('Which browser?');
      await team.page.getByRole('button', { name: 'Send', exact: true }).click();
      await expect(team.page.getByText('Which browser?')).toBeVisible();
      await team.page.getByRole('combobox', { name: 'Assignee' }).click();
      await team.page.getByRole('option', { name: 'Regression Owner' }).click();
      await expect(team.page.getByText('Assigned to Regression Owner').first()).toBeVisible();
      await team.page.getByRole('button', { name: 'Convert to issue', exact: true }).click();
      const issueLink = team.page.getByRole('link', { name: /^[A-Z0-9]+-\d+$/ });
      await expect(issueLink).toBeVisible();
      const identifier = (await issueLink.textContent()) ?? '';

      // The ticket stays reachable from the issue, and a closed ticket leaves the default queue.
      // VI: Ticket vẫn mở được từ Issue, và ticket đã đóng rời khỏi hàng đợi mặc định.
      await issueLink.click();
      await team.page.getByRole('link', { name: /Service Desk ticket/ }).click();
      await expect(team.page.getByRole('link', { name: 'steps.txt' })).toBeVisible();

      // Staying on the ticket would mark it read, so the dot is checked from the list.
      // VI: Ở lại ticket sẽ đánh dấu đã đọc, nên chấm tin mới được kiểm tra từ danh sách.
      await requester.page.goto('/servicedesk');
      const news = requester.page
         .getByRole('listitem')
         .filter({ hasText: title })
         .getByRole('img', { name: 'New activity' });
      await expect(news).toBeVisible();
      await requester.page.getByText(title, { exact: true }).first().click();
      await expect(requester.page.getByText('Which browser?')).toBeVisible();
      await expect(news).toHaveCount(0);
      await expect(requester.page.getByText('Waiting for you').first()).toBeVisible();
      await expect(requester.page.getByText(identifier, { exact: true })).toHaveCount(0);
      const tickets = await requester.context.request.get(`${api}/asks?${query}&scope=mine`);
      expect(await tickets.text()).not.toContain(identifier);
      const issue = await requester.context.request.get(`${api}/issues/${identifier}?${query}`);
      expect(issue.ok()).toBeFalsy();

      await requester.page.getByRole('textbox', { name: 'Write a reply' }).fill('Safari');
      await requester.page.getByRole('button', { name: 'Send', exact: true }).click();
      await expect(requester.page.getByText('Safari')).toBeVisible();
      await expect(requester.page.getByText('Received').first()).toBeVisible();
      await expect(requester.page.getByText('Assigned to Regression Owner').first()).toBeVisible();

      const declined = await team.context.request.post(`${api}/asks?${query}`, {
         data: {
            workspaceId: fixture.workspace_id,
            teamId: (
               await (
                  await team.context.request.get(`${api}/asks/service-desk-projects?${query}`)
               ).json()
            ).data[0].teamId,
            projectId: fixture.projectId,
            title: `${title} closed`,
         },
      });
      const closed = (await declined.json()).data;
      await team.context.request.post(`${api}/asks/${closed.id}/transition?${query}`, {
         data: { action: 'decline', message: 'Out of scope' },
      });
      await openDesk(team.page);
      await team.page.getByRole('tab', { name: /Queue/ }).click();
      await expect(team.page.getByText(title, { exact: true }).first()).toBeVisible();
      await expect(team.page.getByText(`${title} closed`, { exact: true })).toHaveCount(0);
      await team.page.getByRole('combobox', { name: 'Status' }).click();
      await team.page.getByRole('option', { name: 'Closed', exact: true }).click();
      await expect(team.page.getByText(`${title} closed`, { exact: true })).toBeVisible();
      await expect(team.page.getByText(title, { exact: true })).toHaveCount(0);
   } finally {
      await setServiceDesk(team.context, false);
      await team.context.close();
      await requester.context.close();
   }
});

// A question answered in the conversation closes without an issue, and the requester can object.
// VI: Câu hỏi đã trả lời trong trao đổi được đóng mà không cần Issue, và người yêu cầu có thể phản hồi lại.
test('the team resolves a ticket and the requester reopens it', async ({ browser }) => {
   const team = await signIn(browser, fixture.email, { width: 1280, height: 800 });
   const requester = await signIn(browser, fixture.deskRequesterEmail, {
      width: 1280,
      height: 800,
   });
   const title = `Service Desk lifecycle ${Date.now()}`;
   await setServiceDesk(team.context, true);
   try {
      const projects = await requester.context.request.get(
         `${api}/asks/service-desk-projects?${query}`
      );
      const project = (await projects.json()).data[0];
      const created = await requester.context.request.post(`${api}/asks`, {
         data: {
            workspaceId: fixture.workspace_id,
            teamId: project.teamId,
            projectId: project.id,
            title,
         },
      });
      expect(created.ok(), await created.text()).toBeTruthy();

      await openDesk(team.page);
      await team.page.getByRole('tab', { name: /Queue/ }).click();
      await team.page.getByText(title, { exact: true }).first().click();

      // A decline cannot leave without its reason.
      // VI: Không thể từ chối khi chưa có lý do.
      await team.page.getByRole('button', { name: 'Decline', exact: true }).click();
      const decline = team.page.getByRole('dialog');
      await expect(decline.getByRole('button', { name: 'Decline', exact: true })).toBeDisabled();
      await decline.getByRole('button', { name: 'Close', exact: true }).first().click();

      await team.page.getByRole('button', { name: 'Mark as resolved', exact: true }).click();
      await team.page.getByRole('dialog').getByRole('textbox').fill('Restart the app');
      await team.page
         .getByRole('dialog')
         .getByRole('button', { name: 'Mark as resolved', exact: true })
         .click();
      await expect(team.page.getByRole('dialog')).toHaveCount(0);
      await expect(team.page.getByText('Restart the app')).toBeVisible();

      await requester.page.goto('/servicedesk');
      await expect(requester.page.getByRole('button', { name: 'New ticket' })).toBeVisible();
      await expect(requester.page.getByText(title, { exact: true })).toHaveCount(0);
      await requester.page.getByRole('combobox', { name: 'Status' }).click();
      await requester.page.getByRole('option', { name: 'Closed', exact: true }).click();
      await requester.page.getByText(title, { exact: true }).first().click();
      await expect(requester.page.getByText('Restart the app')).toBeVisible();
      await expect(requester.page.getByRole('textbox', { name: 'Write a reply' })).toHaveCount(0);

      await requester.page.getByRole('button', { name: 'Still not fixed' }).click();
      await requester.page.getByRole('dialog').getByRole('textbox').fill('It crashes again');
      await requester.page
         .getByRole('dialog')
         .getByRole('button', { name: 'Reopen', exact: true })
         .click();
      await expect(requester.page.getByRole('dialog')).toHaveCount(0);
      await expect(requester.page.getByText('It crashes again')).toBeVisible();
      await expect(requester.page.getByRole('textbox', { name: 'Write a reply' })).toBeVisible();
   } finally {
      await setServiceDesk(team.context, false);
      await team.context.close();
      await requester.context.close();
   }
});

// A ticket has its own address: it survives a reload, Back leaves it, and it stays private.
// VI: Ticket có địa chỉ riêng: giữ nguyên khi tải lại, Back rời khỏi ticket, và vẫn giữ riêng tư.
test('a ticket keeps its own address and code', async ({ browser }) => {
   const team = await signIn(browser, fixture.email);
   const requester = await signIn(browser, fixture.deskRequesterEmail, { width: 390, height: 780 });
   const stamp = Date.now();
   await setServiceDesk(team.context, true);
   try {
      const projects = await requester.context.request.get(
         `${api}/asks/service-desk-projects?${query}`
      );
      const project = (await projects.json()).data[0];
      const raise = async (context: BrowserContext, title: string) => {
         const response = await context.request.post(`${api}/asks`, {
            data: {
               workspaceId: fixture.workspace_id,
               teamId: project.teamId,
               projectId: project.id,
               title,
            },
         });
         expect(response.ok(), await response.text()).toBeTruthy();
         return (await response.json()).data as { id: string; identifier: string };
      };
      const title = `Service Desk address ${stamp}`;
      const mine = await raise(requester.context, title);
      const hiddenTitle = `Service Desk private ${stamp}`;
      const hidden = await raise(team.context, hiddenTitle);
      expect(mine.identifier).toMatch(/^SD-\d+$/);

      await requester.page.goto('/servicedesk');
      await requester.page.getByText(title, { exact: true }).first().click();
      await expect(requester.page).toHaveURL(new RegExp(`/servicedesk/${mine.id}$`));
      await expect(requester.page.getByText(mine.identifier, { exact: false })).toBeVisible();
      await requester.page.reload();
      await expect(requester.page.getByRole('textbox', { name: 'Write a reply' })).toBeVisible();
      await requester.page.getByRole('button', { name: 'Close', exact: true }).click();
      await expect(requester.page).toHaveURL(/\/servicedesk$/);
      await requester.page.goBack();
      await expect(requester.page.getByRole('textbox', { name: 'Write a reply' })).toBeVisible();
      await requester.page.goBack();
      await expect(requester.page.getByRole('button', { name: 'New ticket' })).toBeVisible();
      await expect(requester.page.getByRole('textbox', { name: 'Write a reply' })).toHaveCount(0);

      await requester.page.goto(`/servicedesk/${hidden.id}`);
      await expect(requester.page.getByRole('button', { name: 'New ticket' })).toBeVisible();
      await expect(requester.page.getByText(hiddenTitle)).toHaveCount(0);

      await openDesk(team.page);
      await team.page.getByRole('tab', { name: /Queue/ }).click();
      await team.page.getByText(title, { exact: true }).first().click();
      await expect(team.page).toHaveURL(new RegExp(`/service-desk/${mine.id}$`));
      await team.page.reload();
      await team.page.getByRole('tab', { name: /Queue/ }).click();
      await expect(team.page.getByRole('button', { name: 'Mark as resolved' })).toBeVisible();
   } finally {
      await setServiceDesk(team.context, false);
      await team.context.close();
      await requester.context.close();
   }
});

// The switch in Project settings decides whether the project appears in the ticket form.
// VI: Công tắc trong Project settings quyết định dự án có xuất hiện trong form ticket hay không.
test('the project settings switch opens the project to tickets', async ({ browser }) => {
   const { context, page } = await signIn(browser, fixture.email);
   const accepting = async () => {
      const response = await context.request.get(`${api}/asks/service-desk-projects?${query}`);
      return (await response.json()).data.map((project: { id: string }) => project.id);
   };
   const openSettings = async () => {
      await page.getByRole('button', { name: 'Project actions' }).click();
      await page.getByRole('menuitem', { name: 'Project settings' }).click();
      return page.getByRole('dialog', { name: 'Project settings' });
   };
   try {
      await page.goto(`/${fixture.slug}/project/${fixture.projectId}/overview`);
      let dialog = await openSettings();
      await dialog.getByRole('switch', { name: 'Service Desk' }).click();
      await expect(dialog.getByRole('switch', { name: 'Service Desk' })).toBeChecked();
      await dialog.getByRole('button', { name: 'Save' }).click();
      await expect(dialog).toHaveCount(0);
      expect(await accepting()).toContain(fixture.projectId);

      await page.reload();
      dialog = await openSettings();
      await expect(dialog.getByRole('switch', { name: 'Service Desk' })).toBeChecked();
   } finally {
      await setServiceDesk(context, false);
      await context.close();
   }
});

// On a phone the ticket replaces the list, and the old Asks page leads to Service Desk.
// VI: Trên điện thoại, ticket thay chỗ danh sách, và trang Asks cũ dẫn tới Service Desk.
test('the desk works at phone width and the old Asks page redirects', async ({ browser }) => {
   const team = await signIn(browser, fixture.email);
   const requester = await signIn(browser, fixture.deskRequesterEmail, { width: 390, height: 780 });
   const title = `Service Desk mobile ${Date.now()}`;
   await setServiceDesk(team.context, true);
   try {
      const projects = await requester.context.request.get(
         `${api}/asks/service-desk-projects?${query}`
      );
      const project = (await projects.json()).data[0];
      const created = await requester.context.request.post(`${api}/asks`, {
         data: {
            workspaceId: fixture.workspace_id,
            teamId: project.teamId,
            projectId: project.id,
            title,
         },
      });
      expect(created.ok(), await created.text()).toBeTruthy();
      const ticket = (await created.json()).data;

      await requester.page.goto(`/${fixture.slug}/settings/asks`);
      await expect(requester.page).toHaveURL(/\/servicedesk/);
      await requester.page.getByText(title, { exact: true }).first().click();
      await expect(requester.page.getByRole('textbox', { name: 'Write a reply' })).toBeVisible();
      const width = await requester.page.evaluate(() => document.documentElement.scrollWidth);
      expect(width).toBeLessThanOrEqual(390);
      await requester.page.getByRole('button', { name: 'Close', exact: true }).click();
      await expect(requester.page.getByRole('button', { name: 'New ticket' })).toBeVisible();

      // An Inbox or email link opens the ticket on the requester's own page.
      // VI: Liên kết từ Inbox hoặc email mở ticket trên trang riêng của người yêu cầu.
      await requester.page.goto(`/${fixture.slug}/service-desk/${ticket.id}`);
      await expect(requester.page).toHaveURL(new RegExp(`/servicedesk/${ticket.id}`));
      await expect(requester.page.getByRole('textbox', { name: 'Write a reply' })).toBeVisible();
      await expect(requester.page.getByRole('button', { name: 'Archive' })).toHaveCount(0);
      await requester.page.getByRole('button', { name: 'Cancel request', exact: true }).click();
      await requester.page
         .getByRole('dialog')
         .getByRole('button', { name: 'Cancel request', exact: true })
         .click();
      await expect(requester.page.getByRole('button', { name: 'Still not fixed' })).toBeVisible();
      await requester.page.getByRole('button', { name: 'Close', exact: true }).click();
      await expect(requester.page.getByText(title, { exact: true })).toHaveCount(0);
   } finally {
      await setServiceDesk(team.context, false);
      await team.context.close();
      await requester.context.close();
   }
});
