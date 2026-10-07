import mongoose from 'mongoose';
import { logger } from '../utils/logger.js';

export async function connectDB(uri: string) {
  // Only fields declared in the schema can be used in query filters. Blocks
  // NoSQL injection like { email: { $ne: null } } sneaking into a filter.
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri);
  logger.info('MongoDB connected');
}

export async function disconnectDB() {
  await mongoose.disconnect();
}
