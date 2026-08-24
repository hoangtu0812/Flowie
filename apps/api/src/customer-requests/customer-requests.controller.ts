import {
   Body,
   Controller,
   Delete,
   Get,
   Param,
   Patch,
   Post,
   Query,
   Req,
   UseGuards,
} from '@nestjs/common';
import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { CreateCustomerRequestDto } from './dto/create-customer-request.dto';
import { UpdateCustomerRequestDto } from './dto/update-customer-request.dto';
import { CustomerRequestsService } from './customer-requests.service';

@UseGuards(AuthGuard)
@Controller('customer-requests')
export class CustomerRequestsController {
   constructor(private readonly customerRequests: CustomerRequestsService) {}

   @Get()
   async list(
      @Query('workspaceId') workspaceId: string,
      @Req() request: AuthenticatedRequest
   ) {
      return { data: await this.customerRequests.list(workspaceId, request.auth!.userId) };
   }

   @Post()
   async create(@Body() dto: CreateCustomerRequestDto, @Req() request: AuthenticatedRequest) {
      return { data: await this.customerRequests.create(dto, request.auth!.userId) };
   }

   @Patch(':requestId')
   async update(
      @Param('requestId') requestId: string,
      @Query('workspaceId') workspaceId: string,
      @Body() dto: UpdateCustomerRequestDto,
      @Req() request: AuthenticatedRequest
   ) {
      return {
         data: await this.customerRequests.update(
            requestId,
            workspaceId,
            dto,
            request.auth!.userId
         ),
      };
   }

   @Delete(':requestId')
   async archive(
      @Param('requestId') requestId: string,
      @Query('workspaceId') workspaceId: string,
      @Req() request: AuthenticatedRequest
   ) {
      return {
         data: await this.customerRequests.archive(requestId, workspaceId, request.auth!.userId),
      };
   }
}
