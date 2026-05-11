import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Req,
  Param,
} from '@nestjs/common';
import { AuditService } from './audit.service';
import { AuditAction } from './audit-log.schema';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { Role } from '../auth/enums/role.enum';

@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Post('track')
  @UseGuards(JwtAuthGuard)
  async trackVisit(@Req() req: any, @Body() body: { section: string }) {
    return this.auditService.create({
      userId: req.user.id,
      action: AuditAction.PAGE_VISIT,
      target: body.section,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  @Get('stats')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  async getStats() {
    return this.auditService.getGlobalStats();
  }

  @Post('reset')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  async resetLogs() {
    console.log('[Audit] Clearing all audit logs by admin request.');
    await this.auditService.clearAllLogs();
    return { success: true, message: "Logs d'audit réinitialisés" };
  }

  @Get('user/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  async getUserLogs(@Param('id') id: string) {
    return this.auditService.getUserLogs(id);
  }
}
