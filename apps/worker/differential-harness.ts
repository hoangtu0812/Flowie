// Runs one pass of the worker's retention logic against DATABASE_URL and
// prints the counts as JSON, so `scripts/compare-retention.py` can set this
// side of the comparison running and read the result back.
//
// It sits outside `src/` on purpose: `tsconfig.json` includes only `src/**`, so
// this never enters the shipped build, and tsx runs it directly. It exists only
// while this worker does — DTD-519 phase 2 deletes both together, and the
// comparison stops being possible at that point, which is why it is worth
// running before then.
//
// VI: Chạy một lượt logic lưu giữ của worker trên DATABASE_URL rồi in các con
// số ra dạng JSON, để `scripts/compare-retention.py` khởi động phía này của
// phép đối chiếu và đọc lại kết quả.
//
// VI: Nó nằm ngoài `src/` có chủ đích: `tsconfig.json` chỉ include `src/**` nên
// VI: file này không bao giờ lọt vào bản build, và tsx chạy thẳng được. Nó chỉ
// VI: tồn tại chừng nào worker còn — DTD-519 giai đoạn 2 xoá cả hai cùng lúc,
// VI: và từ đó phép đối chiếu không còn thực hiện được nữa, nên đáng chạy
// VI: trước thời điểm ấy.
import { PrismaClient } from '@circle/database';
import { runTeamPolicies } from './src/team-policies.js';
import { runCycleCadence } from './src/cycle-cadence.js';

async function main() {
   const which = process.argv[2];
   if (which !== 'policies' && which !== 'cadence') {
      console.error('Usage: tsx differential-harness.ts <policies|cadence>');
      process.exitCode = 2;
      return;
   }
   const prisma = new PrismaClient();
   try {
      const result =
         which === 'cadence' ? await runCycleCadence(prisma) : await runTeamPolicies(prisma);
      console.log(JSON.stringify(result));
   } finally {
      await prisma.$disconnect();
   }
}

void main();
