import { Module } from '@nestjs/common';
import { DockerModule } from '../../modules/docker/docker.module';
import { MongoInfraBootstrap } from './mongo.bootstrap';

/**
 * Infra module that boots Mongo locally (via Docker) on app startup.
 * Import this once in AppModule to enable automatic orchestration.
 */
@Module({
  imports: [DockerModule],
  providers: [MongoInfraBootstrap],
})
export class MongoInfraModule {}
