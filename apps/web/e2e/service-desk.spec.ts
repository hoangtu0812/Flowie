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
   await expect(page).toHaveURL(new RegExp(`/${fixture.slug}/`));
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
      await openDesk(requester.page);
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

      await requester.page.reload();
      await requester.page.getByText(title, { exact: true }).first().click();
      await expect(requester.page.getByText('Which browser?')).toBeVisible();
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
      await team.context.request.patch(`${api}/asks/${closed.id}?${query}`, {
         data: { status: 'declined' },
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
      await expect(requester.page).toHaveURL(new RegExp(`/${fixture.slug}/service-desk`));
      await requester.page.getByText(title, { exact: true }).first().click();
      await expect(requester.page.getByRole('textbox', { name: 'Write a reply' })).toBeVisible();
      const width = await requester.page.evaluate(() => document.documentElement.scrollWidth);
      expect(width).toBeLessThanOrEqual(390);
      await requester.page.getByRole('button', { name: 'Close', exact: true }).click();
      await expect(requester.page.getByRole('button', { name: 'New ticket' })).toBeVisible();

      await requester.page.goto(`/${fixture.slug}/service-desk/${ticket.id}`);
      await expect(requester.page.getByRole('textbox', { name: 'Write a reply' })).toBeVisible();
      await requester.page.getByRole('button', { name: 'Archive', exact: true }).click();
      await expect(requester.page.getByRole('button', { name: 'New ticket' })).toBeVisible();
      await expect(requester.page.getByText(title, { exact: true })).toHaveCount(0);
   } finally {
      await setServiceDesk(team.context, false);
      await team.context.close();
      await requester.context.close();
   }
});
