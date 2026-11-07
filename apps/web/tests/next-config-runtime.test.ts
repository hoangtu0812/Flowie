import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * `next start` reloads next.config.ts from disk, so the running container needs
 * every module that file imports, not only the config itself. The web image
 * copies a hand-picked set of files into its runtime stage, so an import added
 * to the config without a matching COPY makes the server exit with
 * MODULE_NOT_FOUND the moment it starts. Nothing else catches it: the build
 * compiles from a full checkout, and the browser tests start the server from
 * that same checkout, so the gap only appears in a deployed image.
 *
 * VI: `next start` nạp lại next.config.ts từ đĩa, nên container đang chạy cần
 * mọi module mà tệp đó import, không chỉ riêng tệp config. Image web chỉ chép
 * một tập tệp được chọn tay vào tầng runtime, nên một import thêm vào config mà
 * thiếu COPY tương ứng sẽ làm server thoát ngay với MODULE_NOT_FOUND. Không chỗ
 * nào khác bắt được: bản build biên dịch từ checkout đầy đủ, và test trình duyệt
 * cũng khởi động server từ chính checkout đó, nên lỗ hổng chỉ lộ ra trên image
 * đã triển khai.
 */
function runtimeCopies(dockerfile: string): string[] {
   const stages = dockerfile.split(/^FROM .*$/m);
   return [...stages[stages.length - 1].matchAll(/^COPY --from=\S+ (\S+) /gm)].map((match) =>
      match[1].replace(/^\/app\//, '')
   );
}

test('the web image carries every module next.config.ts loads at startup', () => {
   const config = readFileSync('next.config.ts', 'utf8');
   const copied = runtimeCopies(readFileSync('../../infrastructure/docker/web.Dockerfile', 'utf8'));
   assert.ok(
      copied.includes('apps/web/next.config.ts'),
      'the runtime stage must copy the config itself'
   );
   const specifiers = [...config.matchAll(/\bfrom '(\.[^']*)'/g)].map((match) => match[1]);
   assert.ok(specifiers.length > 0, 'this test is pointless if the config imports nothing local');
   for (const specifier of specifiers) {
      const target = `apps/web/${specifier.replace(/^\.\//, '')}.ts`.split('/');
      // A copied directory covers everything under it, so compare path segments
      // rather than strings: `apps/web/lib` satisfies `apps/web/lib/changelog.ts`.
      // VI: Một thư mục đã chép bao luôn mọi thứ bên dưới, nên so theo từng đoạn
      // đường dẫn chứ không so chuỗi: `apps/web/lib` thoả `apps/web/lib/changelog.ts`.
      const present = copied.some((source) =>
         source.split('/').every((part, index) => target[index] === part)
      );
      assert.ok(
         present,
         `web.Dockerfile never copies ${specifier} into its runtime stage, so ` +
            '`next start` in the image exits with MODULE_NOT_FOUND and the proxy serves 502'
      );
   }
});
