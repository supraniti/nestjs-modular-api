import { RefIntegrityService } from '../ref-integrity.service';
import type { DatatypeSeed } from '../internal/datatypes.seeds';

describe('RefIntegrityService', () => {
  it('builds edges from seeds (one/many, onDelete)', () => {
    const mongo = {
      getDb: jest.fn(),
    } as unknown as import('../../mongodb/mongodb.service').MongodbService;
    const svc = new RefIntegrityService(mongo);

    const seeds: ReadonlyArray<DatatypeSeed> = [
      {
        key: 'author',
        keyLower: 'author',
        label: 'Author',
        status: 'published',
        version: 1,
        fields: [],
        storage: { mode: 'single' },
        indexes: [],
        locked: true,
      },
      {
        key: 'post',
        keyLower: 'post',
        label: 'Post',
        status: 'published',
        version: 1,
        fields: [
          {
            fieldKey: 'authorId',
            required: false,
            array: false,
            kind: {
              type: 'ref',
              target: 'author',
              cardinality: 'one',
              onDelete: 'restrict',
            },
          },
          {
            fieldKey: 'tagIds',
            required: false,
            array: true,
            kind: {
              type: 'ref',
              target: 'tag',
              cardinality: 'many',
              onDelete: 'setNull',
            },
          },
        ],
        storage: { mode: 'single' },
        indexes: [],
        locked: true,
      },
      {
        key: 'comment',
        keyLower: 'comment',
        label: 'Comment',
        status: 'published',
        version: 1,
        fields: [
          {
            fieldKey: 'postId',
            required: false,
            array: false,
            kind: {
              type: 'ref',
              target: 'post',
              cardinality: 'one',
              onDelete: 'cascade',
            },
          },
        ],
        storage: { mode: 'single' },
        indexes: [],
        locked: true,
      },
    ];

    svc.buildFromSeeds(seeds);
    const all = svc.toEdges();
    expect(all).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          from: 'post',
          to: 'author',
          fieldKey: 'authorId',
          many: false,
          onDelete: 'restrict',
        }),
        expect.objectContaining({
          from: 'post',
          to: 'tag',
          fieldKey: 'tagIds',
          many: true,
          onDelete: 'setNull',
        }),
        expect.objectContaining({
          from: 'comment',
          to: 'post',
          fieldKey: 'postId',
          many: false,
          onDelete: 'cascade',
        }),
      ]),
    );
  });
});
