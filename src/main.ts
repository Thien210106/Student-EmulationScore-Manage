import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import { join } from 'node:path';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);

  app.setGlobalPrefix('api');
  const configuredOrigins = config.get<string>('FRONTEND_ORIGINS');
  const frontendOrigins = configuredOrigins
    ?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({
    origin: frontendOrigins?.length
      ? frontendOrigins
      : ['http://localhost:5173', 'http://127.0.0.1:5173'],
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('CLASS POINT API')
    .setDescription('Class competition point management API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, swaggerConfig));

  if (config.get<string>('SERVE_FRONTEND') === 'true') {
    const publicDirectory = join(process.cwd(), 'public');
    app.useStaticAssets(publicDirectory);
    app.use((request: Request, response: Response, next: NextFunction) => {
      if (
        request.method !== 'GET' ||
        request.path === '/api' ||
        request.path.startsWith('/api/')
      ) {
        next();
        return;
      }
      response.sendFile(join(publicDirectory, 'index.html'), (error: Error) => {
        if (error) next(error);
      });
    });
  }

  const port = Number(config.get<string>('PORT', '3000'));
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }
  const host = config.get<string>('HOST', '0.0.0.0');
  await app.listen(port, host);
}

void bootstrap();
