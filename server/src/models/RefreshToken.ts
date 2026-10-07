import { Schema, model, Types, type InferSchemaType } from 'mongoose';

// One document per refresh token. A "family" is every token produced by
// rotating from a single login, i.e. one session on one device.
const refreshTokenSchema = new Schema(
  {
    userId: { type: Types.ObjectId, ref: 'User', required: true, index: true },
    // We store a SHA-256 hash, never the token itself. If the database leaks,
    // the attacker gets hashes that can't be used as cookies.
    tokenHash: { type: String, required: true, unique: true },
    family: { type: String, required: true, index: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    userAgent: { type: String, maxlength: 500 },
    ip: { type: String },
  },
  { timestamps: true },
);

// TTL index: MongoDB deletes each document automatically once expiresAt passes,
// so the collection doesn't grow forever. No cron job needed.
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type RefreshToken = InferSchemaType<typeof refreshTokenSchema>;
export const RefreshTokenModel = model('RefreshToken', refreshTokenSchema);
