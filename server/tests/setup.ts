import { afterAll, afterEach, beforeAll } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { UserModel } from '../src/models/User.js';
import { RefreshTokenModel } from '../src/models/RefreshToken.js';

// A real (but throwaway, in-memory) MongoDB per test file: tests exercise real
// queries and real unique indexes, without needing a database installed.
let mongo: MongoMemoryServer;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Promise.all([UserModel.init(), RefreshTokenModel.init()]); // wait for unique indexes to be built
});

afterEach(async () => {
  // Each test starts with an empty database, so tests can't affect each other.
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});
