import { Module } from '@nestjs/common';
import { EntitiesController } from './entities.controller';
import { EntitiesService } from './entities.service';
import { MongodbModule } from '../mongodb/mongodb.module'; // imports provider for MongodbService

@Module({
  imports: [MongodbModule],
  controllers: [EntitiesController],
  providers: [EntitiesService],
  exports: [EntitiesService],
})
export class EntitiesModule {}
