import mongoose from "mongoose";

const branchSchema = new mongoose.Schema({
    originalChatId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "chat",
      required: true,
    },
    branchHistory: [
      {
        role: String,
        parts: [{ text: String }],
        edited: Boolean,
        editedAt: Date,
      },
    ],
    createdAt: {
      type: Date,
      default: Date.now,
    },
  });
  
  export default mongoose.models.branch || mongoose.model("branch", branchSchema);
  