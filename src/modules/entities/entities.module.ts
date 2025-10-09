import { Module } from '@nestjs/common';
import { EntitiesController } from './entities.controller';
import { EntitiesQueryController } from './entities.query.controller';
import { EntitiesService } from './entities.service';
import { MongodbModule } from '../mongodb/mongodb.module'; // imports provider for MongodbService
import { HooksModule } from '../hooks/hooks.module';
import { DatatypesModule } from '../datatypes/datatypes.module';

@Module({
  imports: [MongodbModule, HooksModule, DatatypesModule],
  controllers: [EntitiesController, EntitiesQueryController],
  providers: [EntitiesService],
  exports: [EntitiesService],
})
export class EntitiesModule {}
