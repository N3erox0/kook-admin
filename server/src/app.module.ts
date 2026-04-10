import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { ScheduleModule } from '@nestjs/schedule';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import configuration from './config/configuration';
import { getDatabaseConfig } from './config/database.config';
import { getRedisConfig } from './config/redis.config';
import { AppController } from './app.controller';
import { AppService } from './app.service';

// Core Modules
import { AuthModule } from './modules/auth/auth.module';
import { UserModule } from './modules/user/user.module';
import { GuildModule } from './modules/guild/guild.module';
import { EquipmentCatalogModule } from './modules/equipment-catalog/catalog.module';
import { PermissionModule } from './modules/permission/permission.module';

// Guild-scoped Business Modules
import { MemberModule } from './modules/member/member.module';
import { EquipmentModule } from './modules/equipment/equipment.module';
import { ResupplyModule } from './modules/resupply/resupply.module';
import { AlertModule } from './modules/alert/alert.module';
import { LogModule } from './modules/log/log.module';
import { KookModule } from './modules/kook/kook.module';
import { OcrModule } from './modules/ocr/ocr.module';
import { SchedulerModule } from './modules/scheduler/scheduler.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { UploadModule } from './modules/upload/upload.module';
import { InventoryLogModule } from './modules/inventory-log/inventory-log.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      load: [configuration],
      isGlobal: true,
      envFilePath: ['.env'],
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: getDatabaseConfig,
    }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        redis: getRedisConfig(configService),
      }),
    }),
    ScheduleModule.forRoot(),
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'uploads'),
      serveRoot: '/uploads',
      serveStaticOptions: { index: false },
    }),
    // Core
    AuthModule,
    UserModule,
    GuildModule,
    EquipmentCatalogModule,
    PermissionModule,
    // Business
    MemberModule,
    EquipmentModule,
    ResupplyModule,
    AlertModule,
    LogModule,
    KookModule,
    OcrModule,
    SchedulerModule,
    DashboardModule,
    UploadModule,
    InventoryLogModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
