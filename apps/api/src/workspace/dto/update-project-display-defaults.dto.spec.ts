import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateProjectDisplayDefaultsDto } from './update-project-display-defaults.dto';

const validDefaults = {
   viewTypes: { all: 'list', active: 'timeline' },
   grouping: 'team',
   ordering: 'start-date',
   closedProjects: 'all',
   showEmptyGroups: false,
   showProjectList: true,
   showWeekNumbers: false,
   displayProperties: {
      milestones: false,
      priority: true,
      status: true,
      health: true,
      lead: true,
      members: false,
      targetDate: true,
      issues: true,
      labels: false,
   },
};

describe('UpdateProjectDisplayDefaultsDto', () => {
   it('accepts a complete projects display configuration', async () => {
      const dto = plainToInstance(UpdateProjectDisplayDefaultsDto, validDefaults);

      await expect(validate(dto)).resolves.toHaveLength(0);
   });

   it('rejects unknown views and non-boolean display properties', async () => {
      const dto = plainToInstance(UpdateProjectDisplayDefaultsDto, {
         ...validDefaults,
         viewTypes: { ...validDefaults.viewTypes, all: 'calendar' },
         displayProperties: { ...validDefaults.displayProperties, labels: 'yes' },
      });
      const errors = await validate(dto);

      expect(errors.some((error) => error.property === 'viewTypes')).toBe(true);
      expect(errors.some((error) => error.property === 'displayProperties')).toBe(true);
   });
});
