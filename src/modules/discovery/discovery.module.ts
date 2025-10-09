import { Module } from '@nestjs/common';
import { DiscoveryController } from './discovery.controller';
import { DiscoveryService } from './discovery.service';
import { MongodbModule } from '../mongodb/mongodb.module';
import { EntitiesModule } from '../entities/entities.module';
import { DatatypesModule } from '../datatypes/datatypes.module';

@Module({
  imports: [MongodbModule, EntitiesModule, DatatypesModule],
  controllers: [DiscoveryController],
  providers: [DiscoveryService],
})
export class DiscoveryModule {}
