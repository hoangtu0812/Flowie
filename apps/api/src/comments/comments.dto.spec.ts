import { contentDocumentFromText } from '@circle/contracts';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { ToggleCommentReactionDto } from './dto/toggle-comment-reaction.dto';

describe('Comment DTOs', () => {
   it('accepts a versioned body without requiring duplicate content', async () => {
      const body = contentDocumentFromText('Structured comment');
      await expect(
         validate(
            plainToInstance(CreateCommentDto, {
               workspaceId: 'workspace-1',
               issueId: 'issue-1',
               body,
            })
         )
      ).resolves.toHaveLength(0);
      await expect(validate(plainToInstance(UpdateCommentDto, { body }))).resolves.toHaveLength(0);
   });

   it('rejects an oversized reaction token', async () => {
      const dto = plainToInstance(ToggleCommentReactionDto, {
         workspaceId: 'workspace-1',
         emoji: 'x'.repeat(33),
      });
      await expect(validate(dto)).resolves.not.toHaveLength(0);
   });
});
