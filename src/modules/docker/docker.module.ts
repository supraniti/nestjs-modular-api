import { Module } from '@nestjs/common';
import { DockerService } from './docker.service';
import { DockerClient } from './internal/docker.client';

@Module({
  providers: [DockerClient, DockerService],
  exports: [DockerService],
})
export class DockerModule {}
