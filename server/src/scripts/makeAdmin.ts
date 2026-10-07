/**
 * Promote a user to admin from the command line:
 *   npm run make-admin -- someone@example.com
 * There's deliberately NO API route that turns a normal user into the first admin:
 * the very first admin must come from someone with server access.
 */
import { env } from '../config/env.js';
import { connectDB, disconnectDB } from '../config/db.js';
import { UserModel } from '../models/User.js';

const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  console.error('Usage: npm run make-admin -- <email>');
  process.exit(1);
}

await connectDB(env.MONGODB_URI);
const user = await UserModel.findOneAndUpdate({ email }, { role: 'admin' }, { returnDocument: 'after' });
await disconnectDB();

if (!user) {
  console.error(`No user with email ${email}. Register first.`);
  process.exit(1);
}
console.log(`${user.email} is now an admin.${user.emailVerified ? '' : ' Note: they must verify their email before admin routes work.'}`);
