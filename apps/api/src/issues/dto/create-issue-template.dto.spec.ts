import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateIssueTemplateDto } from './create-issue-template.dto';

describe('CreateIssueTemplateDto', () => {
  it('accepts a complete persisted template', async () => {
    const dto = plainToInstance(CreateIssueTemplateDto, {
      workspaceId: 'workspace-1',
      name: 'Bug report',
      title: 'Bug: ',
      issueDescription: 'Steps to reproduce',
      priority: 'HIGH',
      labelIds: ['bug'],
    });

    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects an invalid name, title and priority', async () => {
    const dto = plainToInstance(CreateIssueTemplateDto, {
      workspaceId: 'workspace-1',
      name: 'x',
      title: '',
      priority: 'critical',
    });

    const fields = (await validate(dto)).map((error) => error.property);
    expect(fields).toEqual(expect.arrayContaining(['name', 'title', 'priority']));
  });
});
