import {
   IsIn,
   IsOptional,
   IsString,
   MaxLength,
   MinLength,
} from 'class-validator';
import {
   customerRequestPriorities,
   customerRequestSources,
   customerRequestStatuses,
} from './create-customer-request.dto';

export class UpdateCustomerRequestDto {
   @IsOptional() @IsString() @MinLength(2) @MaxLength(240) title?: string;
   @IsOptional() @IsString() @MaxLength(10000) description?: string | null;
   @IsOptional() @IsString() @MinLength(1) @MaxLength(160) customer?: string;
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
