import { Module } from '@nestjs/common';
import { MongodbModule } from '../mongodb/mongodb.module';
import { FieldsService } from './fields.service';
import { FieldsController } from './fields.controller';
import { FieldsBootstrap } from './bootstrap/fields.bootstrap';

@Module({
  imports: [MongodbModule],
  controllers: [FieldsController],
  providers: [FieldsService, FieldsBootstrap],
})
export class FieldsModule {}
