import { test } from 'node:test';
import assert from 'node:assert/strict';
import { translate, localeTag } from '../features/shared/locale';
import { modifierKey } from '../features/shared/keyboard';
test('locale and shortcut labels match the selected language and platform', () => {
   assert.equal(translate('en', 'signIn'), 'Sign in');
   assert.equal(translate('vi', 'signIn'), 'Đăng nhập');
   assert.equal(localeTag('vi'), 'vi-VN');
   assert.equal(modifierKey('Win32'), 'Ctrl');
   assert.equal(modifierKey('MacIntel'), '⌘');
});
