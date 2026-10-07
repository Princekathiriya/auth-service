import { Schema, model, Types, type InferSchemaType } from 'mongoose';

export const EMAIL_TOKEN_TYPES = ['verify_email', 'reset_password'] as const;
export type EmailTokenType = (typeof EMAIL_TOKEN_TYPES)[number];

// Single-use tokens sent by email. Like refresh tokens, only the hash is stored.
const emailTokenSchema = new Schema({
  userId: { type: Types.ObjectId, ref: 'User', required: true, index: true },
  // The type is checked on use, so a verify-email link can never be used to reset a password.
  type: { type: String, enum: EMAIL_TOKEN_TYPES, required: true },
  tokenHash: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true },
});

emailTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // auto-delete when expired

export type EmailToken = InferSchemaType<typeof emailTokenSchema>;
export const EmailTokenModel = model('EmailToken', emailTokenSchema);
