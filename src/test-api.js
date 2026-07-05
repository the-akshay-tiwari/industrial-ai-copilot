import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * Verifies that the configured Gemini API key can generate content successfully.
 */
async function testGemini() {
  console.log("⏳ Testing Google Gemini API directly...");
  try {
    // Use the standard Flash model for a lightweight connectivity check.
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent(
      "Reply with exactly two words: 'API Working'",
    );
    console.log("✅ SUCCESS! Real AI Response:", result.response.text());
  } catch (error) {
    console.error("❌ API KEY ERROR:", error.message);
  }
}

testGemini();
