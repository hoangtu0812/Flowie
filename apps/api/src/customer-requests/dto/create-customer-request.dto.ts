import {
   IsIn,
   IsOptional,
   IsString,
   MaxLength,
   MinLength,
} from 'class-validator';

export const customerRequestStatuses = [
   'open',
   'planned',
   'in-progress',
   'completed',
   'declined',
] as const;
export const customerRequestPriorities = ['none', 'low', 'medium', 'high', 'urgent'] as const;
export const customerRequestSources = ['manual', 'interview', 'support', 'sales', 'other'] as const;

export class CreateCustomerRequestDto {
   @IsString() workspaceId!: string;
   @IsString() @MinLength(2) @MaxLength(240) title!: string;
   @IsOptional() @IsString() @MaxLength(10000) description?: string | null;
   @IsString() @MinLength(1) @MaxLength(160) customer!: string;
   @IsOptional() @IsIn(customerRequestSources) source?: (typeof customerRequestSources)[number];
   @IsOptional()
   @IsIn(customerRequestStatuses)
   status?: (typeof customerRequestStatuses)[number];
   @IsOptional()
   @IsIn(customerRequestPriorities)
   priority?: (typeof customerRequestPriorities)[number];
   @IsOptional() @IsString() projectId?: string | null;
   @IsOptional() @IsString() issueId?: string | null;
}
