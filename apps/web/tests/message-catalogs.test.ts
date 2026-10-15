import { test } from 'node:test';
import assert from 'node:assert/strict';
import { messages as issues } from '../features/issues/messages.vi';
import { messages as archive } from '../features/archive/messages.vi';
import { messages as documents } from '../features/documents/messages.vi';
import { messages as security } from '../features/security/messages.vi';
import { messages as reporting } from '../features/reporting/messages.vi';
import { messages as sla } from '../features/sla/messages.vi';
import { messages as recurring } from '../features/recurring/messages.vi';
import { messages as dataExchange } from '../features/data-exchange/messages.vi';
import { messages as navigation } from '../features/navigation/messages.vi';
import { messages as resources } from '../features/shared/messages.vi';
import { preferenceMessages as preferences } from '../features/identity/preference-messages';
test('feature translations retain interpolation fields and valid Unicode', () => {
   const placeholders = (value: string) =>
      [...new Set([...value.matchAll(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g)].map((row) => row[1]))].sort();
   for (const catalog of [
      issues,
      archive,
      documents,
      security,
      reporting,
      sla,
      recurring,
      dataExchange,
      navigation,
      resources,
      preferences,
   ]) {
      for (const [english, vietnamese] of Object.entries(catalog)) {
         assert.ok(vietnamese.trim(), english);
         assert.deepEqual(placeholders(vietnamese), placeholders(english), english);
         assert.doesNotMatch(vietnamese, /\uFFFD|â€|á»/, english);
      }
   }
});
