import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
   fallbackDraft,
   historyFor,
   initialProjectId,
   latestDraft,
   offersTicket,
   type AssistantReply,
   type Exchange,
} from '../features/service-desk/assistant-draft';
import { messages } from '../features/service-desk/messages.vi';

const reply = (status: AssistantReply['status'], answer = 'Answer [S1]'): AssistantReply => ({
   status,
   answer,
   sources: [],
   ticket: { projectId: 'p1', title: 'Draft', description: 'Body' },
});

test('history keeps answered exchanges as alternating, non-empty turns', () => {
   const exchanges: Exchange[] = [
      { question: 'First?', reply: reply('answered') },
      { question: 'Failed?', error: { status: 502, message: '' } },
      { question: 'Unknown?', reply: reply('not_found', '  ') },
      { question: 'Pending?' },
   ];
   assert.deepEqual(historyFor(exchanges), [
      { role: 'user', content: 'First?' },
      { role: 'assistant', content: 'Answer [S1]' },
      { role: 'user', content: 'Unknown?' },
      { role: 'assistant', content: 'The documents do not cover this.' },
   ]);
   const many = Array.from({ length: 10 }, (_, index) => ({
      question: `Q${index}`,
      reply: reply('answered', 'x'.repeat(9_000)),
   }));
   const turns = historyFor(many);
   assert.equal(turns.length, 12);
   assert.equal(turns[0].content, 'Q4');
   assert.ok(turns.every((turn) => turn.content.length <= 4_000));
});

test('ticket drafts come from the latest reply, else from the questions', () => {
   assert.equal(latestDraft([]), undefined);
   assert.deepEqual(latestDraft([{ question: 'A', reply: reply('partial') }, { question: 'B' }]), {
      projectId: 'p1',
      title: 'Draft',
      description: 'Body',
   });
   assert.deepEqual(fallbackDraft(['Can I?', 'Line one\nline two ']), {
      projectId: null,
      title: 'Line one\nline two'.slice(0, 500),
      description: '**Trích hội thoại**\n> Can I?\n> Line one\n> line two ',
   });
   assert.equal(fallbackDraft(['x'.repeat(600)]).title.length, 500);
});

test('the ticket offer follows the answer and the person', () => {
   assert.equal(offersTicket({ question: 'q' }), false);
   assert.equal(offersTicket({ question: 'q', reply: reply('answered') }), false);
   assert.equal(offersTicket({ question: 'q', reply: reply('answered'), resolved: true }), false);
   assert.equal(offersTicket({ question: 'q', reply: reply('answered'), resolved: false }), true);
   assert.equal(offersTicket({ question: 'q', reply: reply('partial') }), true);
   assert.equal(offersTicket({ question: 'q', reply: reply('not_found'), declined: true }), false);
});

test('the ticket form starts on the suggested project only when it is listed', () => {
   const projects = [{ id: 'a' }, { id: 'b' }];
   assert.equal(initialProjectId(projects, 'b'), 'b');
   assert.equal(initialProjectId(projects, 'gone'), 'a');
   assert.equal(initialProjectId(projects, null), 'a');
   assert.equal(initialProjectId([], 'b'), '');
});

test('assistant messages keep their placeholders in Vietnamese', () => {
   assert.equal(messages['I can help with: {names}'], 'Mình có thể giúp về: {names}');
});
