import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
const fixture = JSON.parse(readFileSync('.e2e-fixture.json', 'utf8')) as {
   slug: string;
   team_id: string;
   email: string;
   password: string;
};

// The Agent needs an AI provider the fixture API does not have, so these tests replace the
// stream and conversation endpoints with recorded-shape responses and check only the chat UI.
// VI: Agent cần AI provider mà API fixture không có, nên các test này thay endpoint stream và
// VI: hội thoại bằng phản hồi đúng dạng, và chỉ kiểm tra giao diện chat.
const conversation = { id: 'conv-e2e', title: 'Onboarding plan' };
const userMessage = {
   id: 'msg-user',
   role: 'user',
   content: 'Plan the onboarding project',
   createdAt: '2026-11-13T01:00:00Z',
};
const answer = {
   id: 'msg-answer',
   role: 'assistant',
   content: 'Here is a draft.\n\n```bash\npnpm install\n```',
   proposal: {
      kind: 'plan',
      summary: 'Onboarding',
      requiresClarification: false,
      questions: [],
      projects: [{ identifier: 'ONB', name: 'Onboarding', teamId: fixture.team_id }],
      issues: [
         { key: 'i1', title: 'Write the welcome email', teamId: fixture.team_id, priority: 'HIGH' },
      ],
   },
   createdAt: '2026-11-13T01:00:01Z',
};
const steps = [
   {
      id: 'workspace.access',
      label: 'Workspace access checked',
      state: 'completed',
      orb: 'working',
   },
   { id: 'provider.chat', label: 'Plan received', state: 'completed', orb: 'composing' },
];
const sse = (events: [string, unknown][]) =>
   events.map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join('');

async function openAgent(page: Page) {
   await page.goto('/auth/login');
   await page.getByLabel('Email', { exact: true }).fill(fixture.email);
   await page.getByLabel('Password', { exact: true }).fill(fixture.password);
   await page.getByRole('button', { name: 'Sign in', exact: true }).click();
   await expect(page).toHaveURL(new RegExp(`/${fixture.slug}/`));
   await page.goto(`/${fixture.slug}/agent`);
}

async function ask(page: Page) {
   await page.getByLabel('Message Agent').fill('Plan the onboarding project');
   await page.getByRole('button', { name: 'Send message' }).click();
}

test('Agent turns show folded steps, a plan card, copy actions and a checkpoint', async ({
   page,
}) => {
   let applied = false;
   await page.route('**/agent/conversations/messages/stream', (route) =>
      route.fulfill({
         contentType: 'text/event-stream',
         body: sse([
            ...steps.map((step) => ['progress', step] as [string, unknown]),
            ['complete', { conversation, userMessage, message: answer }],
         ]),
      })
   );
   await page.route(`**/agent/conversations/${conversation.id}?*`, (route) =>
      route.fulfill({
         json: {
            data: {
               ...conversation,
               createdAt: answer.createdAt,
               updatedAt: answer.createdAt,
               messages: [
                  userMessage,
                  applied ? { ...answer, appliedAt: '2026-11-13T01:01:00Z' } : answer,
               ],
            },
         },
      })
   );
   await page.route(`**/agent/messages/${answer.id}/accept?*`, (route) => {
      applied = true;
      return route.fulfill({ json: { data: { projects: {}, issues: {} } } });
   });
   await openAgent(page);
   await ask(page);

   await expect(page.getByText('Completed 2 steps')).toBeVisible();
   await expect(page.getByText('Plan received')).toBeHidden();
   await page.getByText('Completed 2 steps').click();
   await expect(page.getByText('Plan received')).toBeVisible();
   await expect(page.getByRole('button', { name: 'Copy code' })).toBeVisible();
   await expect(page.getByRole('button', { name: 'Copy answer' })).toBeVisible();
   await expect(page.getByText('0 of 2 created')).toBeVisible();
   await expect(page.getByText('Plan applied')).toHaveCount(0);

   await page.getByRole('button', { name: 'Accept plan' }).click();
   await expect(page.getByText('2 of 2 created')).toBeVisible();
   await expect(page.getByText('Plan applied')).toBeVisible();
});

test('A failed Agent turn shows the error and the step that was running', async ({ page }) => {
   await page.route('**/agent/conversations/messages/stream', (route) =>
      route.fulfill({
         contentType: 'text/event-stream',
         body: sse([
            ['progress', steps[0]],
            [
               'progress',
               { id: 'provider.chat', label: 'Calling Openai', state: 'running', orb: 'composing' },
            ],
            ['error', { message: 'The AI provider timed out.' }],
         ]),
      })
   );
   await openAgent(page);
   await ask(page);

   const failure = page.getByRole('alert').filter({ hasText: 'The AI provider timed out.' });
   await expect(failure).toBeVisible();
   await expect(failure.getByText('Failed: Calling Openai')).toBeVisible();
   await expect(page.getByLabel('Message Agent')).toBeEnabled();
});
