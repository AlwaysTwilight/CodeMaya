import mongoose, { Schema } from "mongoose";

export type UserDoc = {
  email: string;
  passwordHash: string;
  createdAt: Date;
};

const UserSchema = new Schema<UserDoc>(
  {
    email: { type: String, required: true, unique: true, index: true },
    passwordHash: { type: String, required: true },
    createdAt: { type: Date, required: true, default: () => new Date() }
  },
  { versionKey: false }
);

export const UserModel = mongoose.models.User ?? mongoose.model<UserDoc>("User", UserSchema);

