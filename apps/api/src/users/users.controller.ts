import { Body, Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { AuthGuard, type AuthenticatedRequest } from '../auth/auth.guard';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UsersService } from './users.service';

@UseGuards(AuthGuard)
@Controller('users')
export class UsersController {
   constructor(private readonly users: UsersService) {}

   @Get('me')
   async me(@Req() request: AuthenticatedRequest) {
      return { data: await this.users.me(request.auth!.userId) };
   }

   @Patch('me')
   async updateProfile(@Body() dto: UpdateProfileDto, @Req() request: AuthenticatedRequest) {
      return { data: await this.users.updateProfile(request.auth!.userId, dto) };
   }
}
