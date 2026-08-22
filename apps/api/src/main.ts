import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module';

async function bootstrap() {
   const app = await NestFactory.create(AppModule);
   const config = app.get(ConfigService);

   app.setGlobalPrefix('api/v1');
   app.enableCors({
      origin: config.get<string>('API_CORS_ORIGIN', 'http://localhost:3000'),
      credentials: true,
   });
   app.useGlobalPipes(
      new ValidationPipe({
         transform: true,
         whitelist: true,
         forbidNonWhitelisted: true,
      }),
   );

   const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
         .setTitle('Circle Platform API')
         .setDescription('Project management platform API')
         .setVersion('v1')
         .build(),
   );
   SwaggerModule.setup('api/docs', app, document);

   const port = config.get<number>('API_PORT', 4000);
   await app.listen(port);
}

void bootstrap();
