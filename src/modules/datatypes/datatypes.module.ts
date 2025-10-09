import { Module } from '@nestjs/common';
import { DatatypesService } from './datatypes.service';
import { DatatypesController } from './datatypes.controller';
import { MongodbModule } from '../mongodb/mongodb.module';
import { DatatypesBootstrap } from './bootstrap/datatypes.bootstrap';
import { HooksModule } from '../hooks/hooks.module';
import { RefIntegrityService } from './ref-integrity.service';

@Module({
  imports: [MongodbModule, HooksModule],
  controllers: [DatatypesController],
  providers: [DatatypesService, DatatypesBootstrap, RefIntegrityService],
  exports: [DatatypesService, RefIntegrityService],
})
export class DatatypesModule {}
