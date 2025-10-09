import { Test } from '@nestjs/testing';
import Ajv from 'ajv';
import { ValidateAction } from '../actions/validate.action';
import type { HookContext } from '../types';
import { SchemaRegistry } from '../schema.registry';
import { HttpException } from '@nestjs/common';

// Minimal mock SchemaRegistry
class MockSchemaRegistry {
  private readonly ajv = new Ajv({ strict: true, allErrors: true });
  private readonly createSchema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      title: { type: 'string', minLength: 1, maxLength: 160 },
      content: { type: 'string', minLength: 1 },
    },
    required: ['title'],
  };
  private readonly updateSchema = {
    type: 'object',
    additionalProperties: false,
    properties: {
      title: { type: 'string', minLength: 1, maxLength: 160 },
      content: { type: 'string', minLength: 1 },
    },
  };
  getCreate() {
    return {
      schema: this.createSchema,
      validate: this.ajv.compile(this.createSchema),
    };
  }
  getUpdate() {
    return {
      schema: this.updateSchema,
      validate: this.ajv.compile(this.updateSchema),
    };
  }
}

describe('ValidateAction', () => {
  it('passes on valid payload', async () => {
    const module = await Test.createTestingModule({
      providers: [
        ValidateAction,
        {
          provide: SchemaRegistry,
          useClass: MockSchemaRegistry,
        },
      ],
    }).compile();
    const action = module.get(ValidateAction);
    const ctx: HookContext = {
      payload: { title: 'Hello', content: 'Body' },
      meta: { typeKey: 'post', phase: 'beforeCreate' },
    };
    const out = await action.run(ctx);
    expect(out).toBeDefined();
  });

  it('returns 422 with AJV issues on invalid payload', async () => {
    const module = await Test.createTestingModule({
      providers: [
        ValidateAction,
        {
          provide: SchemaRegistry,
          useClass: MockSchemaRegistry,
        },
      ],
    }).compile();
    const action = module.get(ValidateAction);
    const ctx: HookContext = {
      payload: { title: '' },
      meta: { typeKey: 'post', phase: 'beforeCreate' },
    };

    await expect(action.run(ctx)).rejects.toBeInstanceOf(HttpException);
  });
});
