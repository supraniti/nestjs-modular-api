// src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthController } from './health.controller';
import { MongoInfraModule } from './infra/mongo/mongo.infra.module';
import { DatatypesModule } from './modules/datatypes/datatypes.module';
import { DiscoveryModule } from './modules/discovery/discovery.module';
import { FieldsModule } from './modules/fields/fields.module';
import { EntitiesModule } from './modules/entities/entities.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongoInfraModule,
    DatatypesModule,
    DiscoveryModule,
    FieldsModule,
    EntitiesModule,
  ],
  controllers: [AppController, HealthController],
  providers: [AppService],
})
export class AppModule {}
