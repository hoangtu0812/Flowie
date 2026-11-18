import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const fixture = JSON.parse(readFileSync('.e2e-fixture.json', 'utf8')) as {
   slug: string;
   email: string;
   password: string;
};

// An administrator adds a webhook, sees its secret once, edits its events and deletes it. No test
// ping is sent, so the run never posts to the outside host; saving only resolves its DNS.
// VI: Quản trị viên thêm webhook, thấy secret một lần, sửa sự kiện rồi xoá. Không gửi ping thử,
// VI: nên lần chạy không bao giờ gửi request tới host bên ngoài; lưu chỉ phân giải DNS của nó.
test('Settings → Integrations manages signed webhooks', async ({ page }) => {
   await page.goto('/auth/login');
   await page.getByLabel('Email', { exact: true }).fill(fixture.email);
   await page.getByLabel('Password', { exact: true }).fill(fixture.password);
   await page.getByRole('button', { name: 'Sign in', exact: true }).click();
   await expect(page).toHaveURL(new RegExp(`/${fixture.slug}/`));

   await page.goto(`/${fixture.slug}/settings/integrations`);
   await expect(page.getByRole('heading', { name: 'Webhooks', exact: true })).toBeVisible();
   await page
      .getByRole('heading', { name: 'Webhooks', exact: true })
      .locator('xpath=..')
      .getByRole('button')
      .click();
   const dialog = page.getByRole('dialog');
   await expect(dialog.getByRole('heading', { name: 'Webhooks' })).toBeVisible();

   const name = `E2E hook ${Date.now()}`;
   await dialog.getByRole('button', { name: 'Add webhook' }).click();
   await dialog.getByLabel('Name').fill(name);
   await dialog.getByLabel('Payload URL').fill('http://example.com/flowie');
   await dialog.getByRole('button', { name: 'Add webhook' }).click();
   await expect(dialog.getByText(/must start with https/)).toBeVisible();

   await dialog.getByLabel('Payload URL').fill('https://example.com/flowie');
   await dialog.getByRole('button', { name: 'Add webhook' }).click();
   const secret = dialog.getByTestId('webhook-secret');
   await expect(secret.getByLabel('Webhook secret')).toHaveValue(/^whsec_/);
   await secret.getByRole('button', { name: 'Done' }).click();
   await expect(secret).toHaveCount(0);

   const row = dialog.getByTestId('webhook-row').filter({ hasText: name });
   await expect(row.getByText('Active')).toBeVisible();
   await expect(row.getByText(/issue\.created, .*project\.update_created/)).toBeVisible();

   await row.getByRole('button', { name: 'Edit' }).click();
   const form = dialog.getByTestId('webhook-form');
   for (const event of ['issue.created', 'issue.assignment', 'project.updated', 'project.update_created']) {
      await form.getByRole('checkbox', { name: event }).click();
   }
   await form.getByRole('switch').click();
   await form.getByRole('button', { name: 'Save webhook' }).click();
   await expect(row.getByText('Off')).toBeVisible();
   await expect(row.getByText('issue.status_changed, issue.comment_created', { exact: true })).toBeVisible();

   await row.getByRole('button', { name: 'Deliveries' }).click();
   await expect(row.getByTestId('webhook-deliveries')).toContainText('No deliveries yet.');

   page.once('dialog', (confirm) => void confirm.accept());
   await row.getByRole('button', { name: 'Delete' }).click();
   await expect(row).toHaveCount(0);
});
