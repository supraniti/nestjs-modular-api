// src/main.ts
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

type CorsOriginCallback = (err: Error | null, allow?: boolean) => void;

async function bootstrap(): Promise<void> {
  // We'll enable CORS with our own policy below
  const app = await NestFactory.create(AppModule, { cors: false });

  // Allow http(s)://localhost:<any>, http(s)://127.0.0.1:<any>, http(s)://[::1]:<any>
  const localhostOrigin =
    /^https?:\/\/(localhost|\[::1\]|127\.0\.0\.1)(:\d+)?$/;

  app.enableCors({
    origin(origin: string | undefined, cb: CorsOriginCallback): void {
      // Allow requests without Origin (curl/Postman/server-to-server)
      if (origin == null) {
        cb(null, true);
        return;
      }
      // Allow localhost on any port (IPv4/IPv6)
      if (localhostOrigin.test(origin)) {
        cb(null, true);
        return;
      }
      // Block everything else (extend as needed)
      cb(new Error(`CORS: origin not allowed → ${String(origin)}`));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: false, // flip to true if you plan to send cookies/Auth from the browser
    maxAge: 86_400, // cache preflight for 24h
  });

  // Global API prefix
  app.setGlobalPrefix('api');

  // Sensible defaults for DTOs
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidUnknownValues: false,
    }),
  );

  await app.listen(process.env.PORT ? Number(process.env.PORT) : 3000);
}

void bootstrap();
