import { buildCycleProgress } from './cycles.service';

describe('buildCycleProgress', () => {
   it('derives scope growth and completion from persisted timestamps', () => {
      const progress = buildCycleProgress(
         {
            status: 'COMPLETED',
            startDate: new Date('2026-08-01T00:00:00.000Z'),
            endDate: new Date('2026-08-03T00:00:00.000Z'),
            createdAt: new Date('2026-07-20T00:00:00.000Z'),
         },
         [
            {
               createdAt: new Date('2026-07-31T12:00:00.000Z'),
               issue: {
                  updatedAt: new Date('2026-08-01T10:00:00.000Z'),
                  completedAt: new Date('2026-08-02T10:00:00.000Z'),
                  status: { category: 'COMPLETED' },
               },
            },
            {
               createdAt: new Date('2026-08-02T12:00:00.000Z'),
               issue: {
                  updatedAt: new Date('2026-08-03T10:00:00.000Z'),
                  completedAt: null,
                  status: { category: 'STARTED' },
               },
            },
         ]
      );

      expect(progress.scope).toBe(2);
      expect(progress.scopeDelta).toBe(100);
      expect(progress.started).toBe(1);
      expect(progress.completed).toBe(1);
      expect(progress.burnup).toEqual([
         { date: '2026-08-01', scope: 1, started: 0, completed: 0, ideal: 0 },
         { date: '2026-08-02', scope: 2, started: 1, completed: 1, ideal: 1 },
         { date: '2026-08-03', scope: 2, started: 2, completed: 1, ideal: 2 },
      ]);
   });

   it('does not invent progress for an upcoming cycle', () => {
      const progress = buildCycleProgress(
         {
            status: 'UPCOMING',
            startDate: new Date('2026-09-01T00:00:00.000Z'),
            endDate: new Date('2026-09-14T00:00:00.000Z'),
            createdAt: new Date('2026-08-20T00:00:00.000Z'),
         },
         []
      );

      expect(progress).toEqual({
         scope: 0,
         scopeDelta: 0,
         started: 0,
         completed: 0,
         burnup: [],
      });
   });
});
