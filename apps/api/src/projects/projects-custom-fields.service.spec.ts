import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ProjectCustomFieldType } from '@circle/database';
import { ProjectsService } from './projects.service';

describe('ProjectsService project custom field values', () => {
   function createService(field: Record<string, unknown> | null) {
      const tx = {
         projectCustomField: {
            update: jest.fn().mockImplementation(({ data }) => ({ ...field, ...data })),
         },
         projectCustomFieldValue: {
            upsert: jest.fn().mockResolvedValue({}),
            deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
         },
         activity: { create: jest.fn().mockResolvedValue({ id: 'activity-1' }) },
      };
      const prisma = {
         workspaceMember: { findFirst: jest.fn().mockResolvedValue({ id: 'member-1' }) },
         projectCustomField: {
            findFirst: jest.fn().mockResolvedValue(field),
            create: jest.fn().mockImplementation(({ data }) => ({ id: 'field-new', ...data })),
         },
         $transaction: jest.fn((operation: (client: typeof tx) => unknown) => operation(tx)),
      };
      const service = new ProjectsService(prisma as never, {} as never);
      jest.spyOn(service, 'get').mockResolvedValue({ id: 'project-1' } as never);
      return { service, prisma, tx };
   }

   it('persists a configured select value and records activity', async () => {
      const field = {
         id: 'field-1',
         workspaceId: 'workspace-1',
         name: 'Region',
         type: ProjectCustomFieldType.SELECT,
         options: ['APAC', 'EMEA'],
         required: false,
      };
      const { service, tx } = createService(field);

      await expect(
         service.updateProjectCustomField('project-1', 'field-1', 'workspace-1', 'APAC', 'user-1')
      ).resolves.toEqual({ ...field, value: 'APAC' });

      expect(tx.projectCustomFieldValue.upsert).toHaveBeenCalledWith(
         expect.objectContaining({
            where: { projectId_fieldId: { projectId: 'project-1', fieldId: 'field-1' } },
            create: expect.objectContaining({ value: 'APAC' }),
            update: { value: 'APAC' },
         })
      );
      expect(tx.activity.create).toHaveBeenCalledWith(
         expect.objectContaining({
            data: expect.objectContaining({ type: 'project.custom-field.updated' }),
         })
      );
   });

   it('rejects values outside configured options', async () => {
      const { service } = createService({
         id: 'field-1',
         workspaceId: 'workspace-1',
         name: 'Region',
         type: ProjectCustomFieldType.SELECT,
         options: ['APAC'],
         required: false,
      });

      await expect(
         service.updateProjectCustomField('project-1', 'field-1', 'workspace-1', 'EMEA', 'user-1')
      ).rejects.toBeInstanceOf(BadRequestException);
   });

   it('does not accept a field from another workspace', async () => {
      const { service } = createService(null);

      await expect(
         service.updateProjectCustomField(
            'project-1',
            'field-other',
            'workspace-1',
            'value',
            'user-1'
         )
      ).rejects.toBeInstanceOf(NotFoundException);
   });

   it('requires options when creating a select field', async () => {
      const { service } = createService(null);

      await expect(
         service.createCustomField(
            { workspaceId: 'workspace-1', name: 'Region', type: ProjectCustomFieldType.SELECT },
            'user-1'
         )
      ).rejects.toBeInstanceOf(BadRequestException);
   });

   it('clears incompatible values when a field type changes', async () => {
      const field = {
         id: 'field-1',
         workspaceId: 'workspace-1',
         name: 'Region',
         type: ProjectCustomFieldType.SELECT,
         options: ['APAC'],
         required: false,
      };
      const { service, tx } = createService(field);

      await service.updateCustomField(
         'field-1',
         'workspace-1',
         { type: ProjectCustomFieldType.TEXT },
         'user-1'
      );

      expect(tx.projectCustomFieldValue.deleteMany).toHaveBeenCalledWith({
         where: { fieldId: 'field-1' },
      });
      expect(tx.projectCustomField.update).toHaveBeenCalledWith(
         expect.objectContaining({
            data: expect.objectContaining({ type: ProjectCustomFieldType.TEXT }),
         })
      );
   });
});
