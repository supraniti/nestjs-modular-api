import { Module } from '@nestjs/common';
import { DatatypesService } from './datatypes.service';
import { DatatypesController } from './datatypes.controller';
import { MongodbModule } from '../mongodb/mongodb.module';

@Module({
  imports: [MongodbModule],
  controllers: [DatatypesController],
  providers: [DatatypesService],
  exports: [DatatypesService],
})
export class DatatypesModule {}
