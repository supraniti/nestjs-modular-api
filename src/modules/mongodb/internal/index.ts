// Re-export thin, typed internals for clean imports.
export * from '@lib/mongodb';
export { getDb, getMongoClient, closeMongoClient } from './mongodb.client';
