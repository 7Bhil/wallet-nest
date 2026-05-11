import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuditLog, AuditAction } from './audit-log.schema';

@Injectable()
export class AuditService {
  constructor(
    @InjectModel(AuditLog.name) private auditLogModel: Model<AuditLog>,
  ) {}

  async clearAllLogs() {
    return this.auditLogModel.deleteMany({}).exec();
  }

  async create(data: Partial<AuditLog>) {
    const log = new this.auditLogModel(data);
    return log.save();
  }

  async getGlobalStats() {
    // Most visited sections
    const pageVisits = await this.auditLogModel.aggregate([
      { $match: { action: AuditAction.PAGE_VISIT } },
      { $group: { _id: '$target', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);

    // Recent connections
    const recentLogins = await this.auditLogModel
      .find({ action: AuditAction.LOGIN })
      .populate('userId', 'fullName email')
      .sort({ createdAt: -1 })
      .limit(20)
      .exec();

    // Unique users today
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const activeUsersToday = await this.auditLogModel.distinct('userId', {
      createdAt: { $gte: startOfToday },
    });

    return {
      topSections: pageVisits,
      recentConnections: recentLogins,
      activeUsersCountToday: activeUsersToday.length,
    };
  }

  async getUserLogs(userId: string) {
    return this.auditLogModel
      .find({ userId })
      .sort({ createdAt: -1 })
      .limit(50)
      .exec();
  }
}
