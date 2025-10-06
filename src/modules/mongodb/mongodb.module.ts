import { Module } from '@nestjs/common';
import { MongodbService } from './mongodb.service';

/**
 * Internal-only MongoDB module.
 * - Provides a thin, typed bridge to the native MongoDB driver.
 * - No controllers (not exposed over HTTP).
 * - Exports the service for consumption by other modules.
 */
@Module({
  providers: [MongodbService],
  exports: [MongodbService],
})
export class MongodbModule {}
