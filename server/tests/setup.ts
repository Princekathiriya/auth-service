import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { UserModel } from '../src/models/User.js';
import { RefreshTokenModel } from '../src/models/RefreshToken.js';
import { EmailTokenModel } from '../src/models/EmailToken.js';
import { setMailer } from '../src/modules/email/mailer.js';
import { fakeMailer } from './helpers/fakeMailer.js';

// A real (but throwaway, in-memory) MongoDB per test file: tests exercise real
// queries and real unique indexes, without needing a database installed.
let mongo: MongoMemoryServer;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Promise.all([UserModel.init(), RefreshTokenModel.init(), EmailTokenModel.init()]); // wait for unique indexes to be built
});

beforeEach(() => {
  fakeMailer.reset();
  setMailer(fakeMailer);
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
