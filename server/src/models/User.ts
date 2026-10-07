import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose';

export const ROLES = ['user', 'admin'] as const;
export type Role = (typeof ROLES)[number];

const userSchema = new Schema(
  {
    // unique creates a unique INDEX: the database itself rejects duplicates,
    // which is the only reliable guard against two simultaneous signups.
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    // select: false => never returned by queries unless explicitly asked for with .select('+passwordHash').
    passwordHash: { type: String, select: false },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    role: { type: String, enum: ROLES, default: 'user' },
    emailVerified: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    toJSON: {
      // Shape of a user in API responses. Second line of defence: even if
      // passwordHash was selected, it is stripped before leaving the server.
      transform(_doc, ret: Record<string, unknown>) {
        ret.id = String(ret._id);
        delete ret._id;
        delete ret.__v;
        delete ret.passwordHash;
        return ret;
      },
    },
  },
);

export type User = InferSchemaType<typeof userSchema>;
export type UserDoc = HydratedDocument<User>;
export const UserModel = model('User', userSchema);
