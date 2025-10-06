// src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthController } from './health.controller';
import { MongoInfraModule } from './infra/mongo/mongo.infra.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Ensures local Mongo (app-mongo, mongo:7) is up and reachable on startup
    MongoInfraModule,
  ],
  controllers: [AppController, HealthController],
  providers: [AppService],
})
export class AppModule {}
