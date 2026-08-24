import { IssueRelationType } from '@circle/database';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LinkIssueDto } from './link-issue.dto';
import { UpdateIssueRelationDto } from './update-issue-relation.dto';

describe('Issue relation DTOs', () => {
   it.each([undefined, IssueRelationType.RELATED, IssueRelationType.BLOCKS])(
      'accepts a supported relation type',
      async (type) => {
         const dto = plainToInstance(LinkIssueDto, {
            workspaceId: 'workspace-1',
            relatedIssueId: 'issue-2',
            ...(type ? { type } : {}),
         });
         await expect(validate(dto)).resolves.toHaveLength(0);
      }
   );

   it('rejects unsupported relation types on create and update', async () => {
      const create = plainToInstance(LinkIssueDto, {
         workspaceId: 'workspace-1',
         relatedIssueId: 'issue-2',
         type: 'BLOCKED_BY',
      });
      const update = plainToInstance(UpdateIssueRelationDto, {
         workspaceId: 'workspace-1',
         type: 'BLOCKED_BY',
      });

      expect((await validate(create)).map((error) => error.property)).toContain('type');
      expect((await validate(update)).map((error) => error.property)).toContain('type');
   });
});
