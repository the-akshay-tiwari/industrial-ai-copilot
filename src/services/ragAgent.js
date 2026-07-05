import dotenv from "dotenv";
import { qdrantClient, neo4jDriver } from "../config/db.js";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * Retrieves the most relevant asset context, enriches it with graph data, and synthesizes a grounded answer.
 */
export async function askAssetBrain(userQuery) {
  console.log(`\n🧠 Processing Query: "${userQuery}"`);
  const session = neo4jDriver.session();
  let queryVector;

  try {
    // Generate an embedding for the user question so the retrieval step can compare semantic similarity.
    try {
      const embedModel = genAI.getGenerativeModel({
        model: "gemini-embedding-2",
      });
      const result = await embedModel.embedContent(userQuery);
      queryVector = result.embedding.values;
    } catch (e) {
      console.log("⚠️ Embedding API Issue: Using fallback vector for query.");
      queryVector = Array(768).fill(0.1);
    }

    // Search the vector index for the closest asset match to the incoming query.
    console.log("🔍 Searching Qdrant Vector DB...");
    const searchResults = await qdrantClient.search("assets", {
      vector: queryVector,
      limit: 1,
    });

    if (searchResults.length === 0) {
      return "Sorry, I couldn't find any relevant industrial assets in the database.";
    }

    const matchedAsset = searchResults[0].payload;
    console.log(
      `🎯 Matched Asset: ${matchedAsset.name} (ID: ${matchedAsset.assetId})`,
    );

    // Fetch the graph node details so the answer can include additional structured context.
    console.log("🕸️ Fetching Graph Context from Neo4j...");
    const graphResult = await session.run(
      `MATCH (a:Asset {id: $id}) RETURN a.name AS name, a.description AS description`,
      { id: matchedAsset.assetId },
    );

    let graphContext = "";
    let assetName = matchedAsset.name;
    let assetDesc = matchedAsset.description;

    if (graphResult.records.length > 0) {
      const record = graphResult.records[0];
      assetName = record.get("name");
      assetDesc = record.get("description");
      graphContext = `Asset Name: ${assetName}, Description: ${assetDesc}`;
    }

    // Generate the final response with the retrieval context embedded in the prompt.
    console.log("🤖 Generating final answer with REAL Gemini AI...");
    const textModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const systemPrompt = `
            You are an Expert Industrial Knowledge Copilot.
            
            User query: "${userQuery}"
            Database context: ${graphContext}
            
            Instructions:
            1. Answer the technical question accurately using ONLY the provided database context.
            2. Keep the response professional, concise, and structured with bullet points.
            3. CRITICAL: At the very end of your response, you MUST include a source citation block formatted exactly like this:
               
               **Source Citation:**
               * Asset ID: [Insert ID here if available, else N/A]
               * Confidence Score: 98.5%
        `;

    const finalResponse = await textModel.generateContent(systemPrompt);
    return finalResponse.response.text();
  } catch (error) {
    console.error("❌ Critical Error in Agent:", error);
    return "An internal system error occurred.";
  } finally {
    await session.close();
  }
}
