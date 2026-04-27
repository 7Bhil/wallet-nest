import { Controller, Get, Patch, Param, UseGuards, Request } from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('stats')
  async getStats() {
    return this.adminService.getStats();
  }

  @Get('users')
  async getUsers() {
    return this.adminService.getAllUsers();
  }

  @Patch('users/:id/toggle-status')
  async toggleStatus(@Param('id') id: string, @Request() req: any) {
    return this.adminService.toggleUserStatus(id, req.user.id);
  }

  @Get('feed')
  async getFeed() {
    return this.adminService.getGlobalFeed();
  }

  @Get('users/:id')
  async getUserDetails(@Param('id') id: string) {
    return this.adminService.getUserDetails(id);
  }
}
