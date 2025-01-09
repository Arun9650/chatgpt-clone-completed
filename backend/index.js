import express from "express";
import cors from "cors";
import path from "path";
import url, { fileURLToPath } from "url";
import ImageKit from "imagekit";
import dotenv from "dotenv";
import mongoose from "mongoose";
import Chat from "./models/chat.js";
import UserChats from "./models/userChats.js";
import { ClerkExpressRequireAuth } from "@clerk/clerk-sdk-node";
import branch from "./models/branch.js";
dotenv.config();
// require('dotenv').config();
const port = process.env.PORT || 3000;
const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('CLIENT_URL API URL:', process.env.CLIENT_URL);

app.use(
  cors({
    origin: process.env.CLIENT_URL,
    credentials: true,
  })
);

app.use(express.json());

const connect = async () => {
  try {
    await mongoose.connect(process.env.MONGO);
    console.log("Connected to MongoDB");
  } catch (err) {
    console.log(err);
  }
};
console.log('Clerk Publishable Key:', process.env.CLERK_PUBLISHABLE_KEY);



const imagekit = new ImageKit({
  urlEndpoint: process.env.IMAGE_KIT_ENDPOINT,
  publicKey: process.env.IMAGE_KIT_PUBLIC_KEY,
  privateKey: process.env.IMAGE_KIT_PRIVATE_KEY,
});

app.get("/api/upload", (req, res) => {
  const result = imagekit.getAuthenticationParameters();
  res.send(result);
});

app.post("/api/chats", ClerkExpressRequireAuth(), async (req, res) => {
  const userId = req.auth.userId;
  const { text } = req.body;

  try {
    // CREATE A NEW CHAT
    const newChat = new Chat({
      userId: userId,
      history: [{ role: "user", parts: [{ text }] }],
    });

    const savedChat = await newChat.save();

    // CHECK IF THE USERCHATS EXISTS
    const userChats = await UserChats.find({ userId: userId });

    // IF DOESN'T EXIST CREATE A NEW ONE AND ADD THE CHAT IN THE CHATS ARRAY
    if (!userChats.length) {
      const newUserChats = new UserChats({
        userId: userId,
        chats: [
          {
            _id: savedChat._id,
            title: text.substring(0, 40),
          },
        ],
      });

      await newUserChats.save();
    } else {
      // IF EXISTS, PUSH THE CHAT TO THE EXISTING ARRAY
      await UserChats.updateOne(
        { userId: userId },
        {
          $push: {
            chats: {
              _id: savedChat._id,
              title: text.substring(0, 40),
            },
          },
        }
      );

      res.status(201).send(newChat._id);
    }
  } catch (err) {
    console.log(err);
    res.status(500).send("Error creating chat!");
  }
});

app.get("/api/userchats", ClerkExpressRequireAuth(), async (req, res) => {
  const userId = req.auth.userId;

  try {
    const userChats = await UserChats.find({ userId });

    res.status(200).send(userChats[0].chats);
  } catch (err) {
    console.log(err);
    res.status(500).send("Error fetching userchats!");
  }
});

app.get("/api/chats/:id", ClerkExpressRequireAuth(), async (req, res) => {
  const userId = req.auth.userId;

  try {
    const chat = await Chat.findOne({ _id: req.params.id, userId });

    res.status(200).send(chat);
  } catch (err) {
    console.log(err);
    res.status(500).send("Error fetching chat!");
  }
});

app.put("/api/chats/:id", ClerkExpressRequireAuth(), async (req, res) => {
  const userId = req.auth.userId;

  const { question, answer, img } = req.body;

  const newItems = [
    ...(question
      ? [{ role: "user", parts: [{ text: question }], ...(img && { img }) }]
      : []),
    { role: "model", parts: [{ text: answer }] },
  ];

  try {
    const updatedChat = await Chat.updateOne(
      { _id: req.params.id, userId },
      {
        $push: {
          history: {
            $each: newItems,
          },
        },
      }
    );
    res.status(200).send(updatedChat);
  } catch (err) {
    console.log(err);
    res.status(500).send("Error adding conversation!");
  }
});

app.put("/api/chats/:id/edit", ClerkExpressRequireAuth(), async (req, res) => {
  const userId = req.auth.userId;
  const { messageIndex, newText } = req.body;

  try {
    // Find the chat document and update the specific message by index
    const updatedChat = await Chat.updateOne(
      { _id: req.params.id, userId },
      {
        $set: {
          [`history.${messageIndex}.parts.0.text`]: newText,
          [`history.${messageIndex}.edited`]: true,
          [`history.${messageIndex}.editedAt`]: new Date(),
        },
      }
    );

    if (updatedChat.nModified === 0) {
      return res.status(404).send("Chat or message not found!");
    }

    res.status(200).send("Message edited successfully!");
  } catch (err) {
    console.error("Error editing message:", err);
    res.status(500).send("Error editing message!");
  }
});

app.post("/api/chats/:id/branch", ClerkExpressRequireAuth(), async (req, res) => {
  const userId = req.auth.userId;
  const { messageIndex, newText } = req.body;

  try {
    // Find the original chat
    const chat = await Chat.findOne({ _id: req.params.id, userId });
    if (!chat) return res.status(404).json({ error: "Chat not found" });

    // Clone history up to the edited message
    const branchHistory = [...chat.history];
    branchHistory[messageIndex].parts[0].text = newText;
    branchHistory[messageIndex].edited = true;
    branchHistory[messageIndex].editedAt = new Date();

    // Create a new branch
    const newBranch = new branch({
      originalChatId: chat._id,
      branchHistory,
    });

    await newBranch.save();
    res.status(201).json({ message: "Branch created successfully", branch: newBranch });
  } catch (err) {
    console.error("Error creating branch:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/api/chats/:id/branches", ClerkExpressRequireAuth(), async (req, res) => {
  const userId = req.auth.userId;

  try {
    const branches = await branch.find({ originalChatId: req.params.id });
    res.status(200).json(branches);
  } catch (err) {
    console.error("Error fetching branches:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(401).send("Unauthenticated!");
});

// PRODUCTION
app.use(express.static(path.join(__dirname, "../client/dist")));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../client/dist", "index.html"));
});

app.listen(port, () => {
  connect();
  console.log("Server running on 3000");
});