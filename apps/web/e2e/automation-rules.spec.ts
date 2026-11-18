import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const fixture = JSON.parse(readFileSync('.e2e-fixture.json', 'utf8')) as {
   slug: string;
   team_id: string;
   email: string;
   password: string;
};

// The team lead adds the "all sub-issues closed → status" rule, turns it off and deletes it in
// Team settings (DTD-903). Running rules is covered by the API tests.
// VI: LEAD của team thêm rule "mọi sub-issue đã đóng → đổi trạng thái", tắt rồi xoá trong Team
// VI: settings (DTD-903). Việc chạy rule được kiểm bằng test API.
test('Team settings manages automation rules', async ({ page }) => {
   await page.goto('/auth/login');
   await page.getByLabel('Email', { exact: true }).fill(fixture.email);
   await page.getByLabel('Password', { exact: true }).fill(fixture.password);
   await page.getByRole('button', { name: 'Sign in', exact: true }).click();
   await expect(page).toHaveURL(new RegExp(`/${fixture.slug}/`));

   await page.goto(`/${fixture.slug}/settings/teams/${fixture.team_id}`);
   const section = page.getByTestId('automation-rules');
   await section.getByRole('button', { name: 'Add rule' }).click();

   const name = `E2E rule ${Date.now()}`;
   const form = page.getByTestId('automation-rule-form');
   await form.getByLabel('Name').fill(name);
   await expect(form.getByLabel('Trigger')).toHaveText('All sub-issues are closed');
   await form.getByLabel('Status').click();
   await page.getByRole('option').first().click();
   await form.getByRole('button', { name: 'Create rule' }).click();
   await expect(form).toHaveCount(0);

   const row = section.getByTestId('automation-rule-row').filter({ hasText: name });
   await expect(row.getByText('When all sub-issues are closed → Set status', { exact: false })).toBeVisible();
   const toggle = row.getByRole('switch', { name: `Enable ${name}` });
   await expect(toggle).toBeChecked();
   await toggle.click();
   await expect(toggle).not.toBeChecked();

   page.once('dialog', (confirm) => void confirm.accept());
   await row.getByRole('button', { name: 'Delete' }).click();
   await expect(row).toHaveCount(0);
});
