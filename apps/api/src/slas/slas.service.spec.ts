import { SlasService } from './slas.service';

describe('SlasService.resolveDeadline', () => {
   const findMany = jest.fn();
   const service = new SlasService(
      { slaPolicy: { findMany } } as never,
      { record: jest.fn() } as never
   );

   beforeEach(() => findMany.mockReset());

   it('uses the most specific matching team and priority policy', async () => {
      findMany.mockResolvedValue([
         {
            id: 'global',
            teamId: null,
            priority: null,
            deadlineMinutes: 1440,
         },
         {
            id: 'team-urgent',
            teamId: 'team-1',
            priority: 'URGENT',
            deadlineMinutes: 60,
         },
         {
            id: 'urgent',
            teamId: null,
            priority: 'URGENT',
            deadlineMinutes: 240,
         },
      ]);
      const baseDate = new Date('2026-08-24T00:00:00.000Z');

      await expect(service.resolveDeadline('workspace-1', 'team-1', 'URGENT', baseDate)).resolves.toEqual({
         policyId: 'team-urgent',
         dueDate: new Date('2026-08-24T01:00:00.000Z'),
      });
   });

   it('returns no deadline when no policy matches', async () => {
      findMany.mockResolvedValue([]);
      await expect(service.resolveDeadline('workspace-1', 'team-1', 'NONE')).resolves.toBeUndefined();
   });
});
