import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * `next start` transpiles next.config.ts to next.config.compiled.js and loads
 * that with plain Node. Node resolves neither a `.ts` extension nor this app's
 * `@/` aliases, and the deployed image carries only the config file itself, no
 * TypeScript toolchain and no app sources. A local import therefore resolves in
 * a checkout and throws MODULE_NOT_FOUND in the container, which exits before
 * serving anything and leaves the proxy in front of it answering 502 for the
 * whole site.
 *
 * Nothing else catches this. `next build` compiles from a full checkout, the
 * Playwright webServer starts from that same checkout, and copying the imported
 * file into the image is not enough either, because Node still will not resolve
 * a `.ts` path. The only rule that holds is that the config imports nothing
 * local, so that is what this test enforces.
 *
 * VI: `next start` biên dịch next.config.ts thành next.config.compiled.js rồi
 * nạp bằng Node thuần. Node không phân giải đuôi `.ts` lẫn alias `@/` của app,
 * và image đã triển khai chỉ mang theo chính tệp config, không có bộ công cụ
 * TypeScript và không có mã nguồn app. Vì vậy một import cục bộ phân giải được
 * trong bản checkout nhưng ném MODULE_NOT_FOUND trong container, khiến container
 * thoát trước khi phục vụ bất cứ thứ gì và proxy đứng trước nó trả 502 cho toàn
 * bộ trang.
 *
 * Không chỗ nào khác bắt được lỗi này. `next build` biên dịch từ checkout đầy
 * đủ, webServer của Playwright cũng khởi động từ chính checkout đó, và việc chép
 * tệp được import vào image cũng không đủ, vì Node vẫn không phân giải đường dẫn
 * `.ts`. Quy tắc duy nhất đứng vững là config không import gì cục bộ, và đó là
 * điều test này canh.
 */
test('next.config.ts imports nothing that the deployed image cannot resolve', () => {
   const config = readFileSync('next.config.ts', 'utf8');
   const local = [...config.matchAll(/\b(?:from|require\()\s*'((?:\.|@\/)[^']*)'/g)].map(
      (match) => match[1]
   );
   assert.deepEqual(
      local,
      [],
      `next.config.ts must not import local modules (found ${local.join(', ')}): ` +
         '`next start` loads it with plain Node in an image that has only this file, ' +
         'so the container exits with MODULE_NOT_FOUND and the proxy serves 502. ' +
         'Export the shared code from next.config.ts instead of importing it into it.'
   );
   // The image copies the config by this exact path, so a rename has to be made
   // in both places or the container starts with the wrong basePath.
   // VI: Image chép tệp config theo đúng đường dẫn này, nên khi đổi tên phải sửa
   // cả hai nơi, nếu không container khởi động với basePath sai.
   const dockerfile = readFileSync('../../infrastructure/docker/web.Dockerfile', 'utf8');
   assert.ok(
      dockerfile.includes('/app/apps/web/next.config.ts ./apps/web/next.config.ts'),
      'the runtime stage must copy next.config.ts'
   );
});
