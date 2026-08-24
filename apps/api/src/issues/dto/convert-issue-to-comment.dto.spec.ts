import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ConvertIssueToCommentDto } from './convert-issue-to-comment.dto';

describe('ConvertIssueToCommentDto', () => {
   it('accepts a workspace-scoped target issue identifier', async () => {
      const errors = await validate(
         plainToInstance(ConvertIssueToCommentDto, {
            workspaceId: 'workspace-1',
            targetIdentifier: 'CORE-123',
         })
      );

      expect(errors).toHaveLength(0);
   });

   it('rejects free-form target text', async () => {
      const errors = await validate(
         plainToInstance(ConvertIssueToCommentDto, {
            workspaceId: 'workspace-1',
            targetIdentifier: 'not an issue',
         })
      );

      expect(errors.some((error) => error.property === 'targetIdentifier')).toBe(true);
   });
});
