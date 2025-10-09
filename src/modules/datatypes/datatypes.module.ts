import { Module } from '@nestjs/common';
import { DatatypesService } from './datatypes.service';
import { DatatypesController } from './datatypes.controller';
import { MongodbModule } from '../mongodb/mongodb.module';
import { DatatypesBootstrap } from './bootstrap/datatypes.bootstrap';

@Module({
  imports: [MongodbModule],
  controllers: [DatatypesController],
  providers: [DatatypesService, DatatypesBootstrap],
  exports: [DatatypesService],
})
export class DatatypesModule {}
