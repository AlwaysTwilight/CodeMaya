import mongoose, { Schema } from "mongoose";

export type AskHistoryDoc = {
  userId: mongoose.Types.ObjectId;
  question: string;
  answer: string;
  sources: string[];
  confidence: "high" | "medium" | "low";
  latencyMs: number;
  createdAt: Date;
};

const AskHistorySchema = new Schema<AskHistoryDoc>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    question: { type: String, required: true },
    answer: { type: String, required: true },
    sources: { type: [String], required: true, default: [] },
    confidence: { type: String, required: true },
    latencyMs: { type: Number, required: true },
    createdAt: { type: Date, required: true, default: () => new Date() }
  },
  { versionKey: false }
);

AskHistorySchema.index({ userId: 1, createdAt: -1 });

export const AskHistoryModel =
  mongoose.models.AskHistory ?? mongoose.model<AskHistoryDoc>("AskHistory", AskHistorySchema);

