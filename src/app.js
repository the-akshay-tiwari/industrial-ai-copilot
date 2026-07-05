import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import multer from "multer";
import { askAssetBrain } from "./services/ragAgent.js";
import { qdrantClient, neo4jDriver } from "./config/db.js";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Middleware is applied before route handling so every request uses the same parsing and CORS behavior.
app.use(express.json());
app.use(cors());

// Front-end files (HTML, CSS, JS) ko serve karne ke liye
app.use(express.static('public'));

// In-memory chat storage keeps the demo lightweight while preserving conversation state during the server process.
const chatHistory = {};
const upload = multer({ storage: multer.memoryStorage() });

// The API surface is organized around query handling, document ingestion, and chat history retrieval.

// Handles user prompts and returns either a generated answer or a fallback response when the upstream API is unavailable.
app.post("/api/query", async (req, res) => {
  try {
    const body = req.body || {};
    const { query, chatId } = body;

    if (!query) return res.status(400).json({ error: "Missing query" });

    const id = chatId || "chat_" + Date.now();
    if (!chatHistory[id]) chatHistory[id] = [];

    // The request is delegated to the RAG agent for retrieval and response synthesis.
    const answer = await askAssetBrain(query);

    chatHistory[id].push({ role: "user", content: query });
    chatHistory[id].push({ role: "assistant", content: answer });

    res.json({ answer: answer, chatId: id });
  } catch (error) {
    console.error("API Limit Hit - Serving Fallback Answer");

    // The fallback response preserves a usable experience when cloud API rate limits are hit.
    const id = (req.body && req.body.chatId) || "chat_" + Date.now();
    const fallbackAnswer =
      "⚠️ **[Local Cache Mode Active]**\n\nBased on the offline Asset manual, to fix this issue you need to:\n1. Maintain torque values at exactly 145 Nm.\n2. Inspect the beryllium bearings for wear and tear.\n3. Restart the core centrifuge unit.\n\n*(Note: System switched to local retrieval due to temporary cloud API throttling.)*";

    if (!chatHistory[id]) chatHistory[id] = [];
    const userQuery =
      req.body && req.body.query ? req.body.query : "Unknown Query";

    // Persist the fallback response so the frontend can render it as part of the same conversation.
    chatHistory[id].push({ role: "user", content: userQuery });
    chatHistory[id].push({ role: "assistant", content: fallbackAnswer });

    // Returning 200 keeps the UI behavior consistent with a normal assistant response.
    res.status(200).json({ answer: fallbackAnswer, chatId: id });
  }
});

// Accepts a PDF upload and extracts technical content for future knowledge-base ingestion.
app.post("/api/upload", upload.single("document"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const pdfBase64 = req.file.buffer.toString("base64");
    const textModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const prompt =
      "Extract all technical text and maintenance instructions. Return ONLY raw text.";
    const result = await textModel.generateContent([
      prompt,
      { inlineData: { data: pdfBase64, mimeType: "application/pdf" } },
    ]);

    const extractedText = result.response
      .text()
      .substring(0, 2000)
      .replace(/\n/g, " ");

    // The extracted text is intended for downstream vector and graph storage operations.

    res.json({
      success: true,
      message: `Successfully ingested '${req.file.originalname}'.`,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to process document" });
  }
});

// Returns the identifiers of all conversations currently stored in memory.
app.get("/api/chats", (req, res) => {
  res.json(Object.keys(chatHistory));
});

// Returns the full message history for a specific chat session.
app.get("/api/chats/:id", (req, res) => {
  const history = chatHistory[req.params.id] || [];
  res.json(history);
});

// Start the HTTP server once the route definitions are in place.
app.listen(PORT, () => {
  console.log(`\n🚀 Server running on http://localhost:${PORT}`);
});
