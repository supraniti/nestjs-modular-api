// Re-export thin, typed internals for clean imports.
export * from './mongodb.types';
export { getDb, getMongoClient, closeMongoClient } from './mongodb.client';
