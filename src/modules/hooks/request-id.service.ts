import { Inject, Injectable, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { Request } from 'express';

function makeId(): string {
  const g = globalThis as unknown as { crypto?: { randomUUID?: () => string } };
  const gen = g.crypto?.randomUUID;
  if (typeof gen === 'function') return gen();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

@Injectable({ scope: Scope.REQUEST })
export class RequestIdService {
  private id?: string;
  constructor(@Inject(REQUEST) private readonly req: Request) {}

  getId(): string {
    if (this.id) return this.id;
    const fromHeader = (this.req.headers['x-request-id'] ??
      this.req.headers['x-correlation-id']) as string | undefined;
    this.id = (fromHeader && String(fromHeader)) || makeId();
    return this.id;
  }
}
