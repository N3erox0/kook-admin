import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { OperationLog } from './entities/operation-log.entity';
import { QueryLogDto } from './dto/log.dto';

@Injectable()
export class LogService {
  constructor(
    @InjectRepository(OperationLog)
    private logRepo: Repository<OperationLog>,
  ) {}

  async findAll(query: QueryLogDto) {
    const page = query.page || 1;
    const pageSize = query.pageSize || 20;
    const qb = this.logRepo.createQueryBuilder('log');

    if (query.module) qb.andWhere('log.module = :module', { module: query.module });
    if (query.action) qb.andWhere('log.action = :action', { action: query.action });
    if (query.userId) qb.andWhere('log.userId = :userId', { userId: query.userId });
    if (query.startDate && query.endDate) {
      qb.andWhere('log.createdAt BETWEEN :start AND :end', {
        start: query.startDate,
        end: query.endDate,
      });
    } else if (query.startDate) {
      qb.andWhere('log.createdAt >= :start', { start: query.startDate });
    } else if (query.endDate) {
      qb.andWhere('log.createdAt <= :end', { end: query.endDate });
    }

    qb.orderBy('log.createdAt', 'DESC').skip((page - 1) * pageSize).take(pageSize);
    const [list, total] = await qb.getManyAndCount();
    return { list, total, page, pageSize };
  }

  async create(data: Partial<OperationLog>) {
    const log = this.logRepo.create(data);
    return this.logRepo.save(log);
  }

  async getModules() {
    const result = await this.logRepo
      .createQueryBuilder('log')
      .select('DISTINCT log.module', 'module')
      .getRawMany();
    return result.map((r) => r.module);
  }
}
