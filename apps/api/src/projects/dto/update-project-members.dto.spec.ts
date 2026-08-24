import { validate } from 'class-validator';
import { UpdateProjectMembersDto } from './update-project-members.dto';

const makeDto = (input: Partial<UpdateProjectMembersDto>) =>
   Object.assign(new UpdateProjectMembersDto(), input);

describe('UpdateProjectMembersDto', () => {
   it('accepts an empty or unique list of project members', async () => {
      await expect(
         validate(makeDto({ workspaceId: 'workspace-1', userIds: [] }))
      ).resolves.toHaveLength(0);
      await expect(
         validate(makeDto({ workspaceId: 'workspace-1', userIds: ['user-1', 'user-2'] }))
      ).resolves.toHaveLength(0);
   });

   it('rejects blank workspace IDs, duplicate users, blank users and oversized lists', async () => {
      await expect(
         validate(makeDto({ workspaceId: '', userIds: ['user-1', 'user-1'] }))
      ).resolves.not.toHaveLength(0);
      await expect(
         validate(makeDto({ workspaceId: 'workspace-1', userIds: [''] }))
      ).resolves.not.toHaveLength(0);
      await expect(
         validate(
            makeDto({
               workspaceId: 'workspace-1',
               userIds: Array.from({ length: 101 }, (_, index) => `user-${index}`),
            })
         )
      ).resolves.not.toHaveLength(0);
   });
});
