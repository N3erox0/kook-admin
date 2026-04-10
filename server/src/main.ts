import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { globalValidationPipe } from './common/pipes/validation.pipe';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { LogService } from './modules/log/log.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // 注意: 大部分 Controller 路径已包含 'api/' 前缀，不再设置全局前缀
  // app.setGlobalPrefix('api');
  app.useGlobalPipes(globalValidationPipe);
  app.useGlobalFilters(new HttpExceptionFilter());

  // 注入带 DI 的拦截器
  const reflector = app.get(Reflector);
  const logService = app.get(LogService);
  app.useGlobalInterceptors(new TransformInterceptor(), new LoggingInterceptor(reflector, logService));

  app.enableCors({
    origin: ['http://localhost:5173', 'http://localhost:3000'],
    credentials: true,
  });

  const config = new DocumentBuilder()
    .setTitle('KOOK 装备管理后台 API')
    .setDescription('KOOK 装备管理后台系统 API 文档')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.APP_PORT || 3000;
  await app.listen(port);
  console.log(`Application running on: http://localhost:${port}`);
  console.log(`Swagger docs: http://localhost:${port}/api/docs`);
}
bootstrap();
