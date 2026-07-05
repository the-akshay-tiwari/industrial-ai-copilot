import dotenv from "dotenv";
import { QdrantClient } from "@qdrant/js-client-rest";
import neo4j from "neo4j-driver";

// Load environment variables before initialising the service clients.
dotenv.config();

// Initialize the Qdrant client used for vector similarity search.
export const qdrantClient = new QdrantClient({
  url: process.env.QDRANT_URL,
  apiKey: process.env.QDRANT_API_KEY,
});

// Initialize the Neo4j driver used for graph-based retrieval context.
export const neo4jDriver = neo4j.driver(
  process.env.NEO4J_URI,
  neo4j.auth.basic(process.env.NEO4J_USERNAME, process.env.NEO4J_PASSWORD),
);

/**
 * Verifies that the configured Neo4j and Qdrant services are reachable.
 */
export async function testConnections() {
  console.log("⏳ Testing database connections...");

  try {
    // Confirm the Neo4j service is available.
    const serverInfo = await neo4jDriver.getServerInfo();
    console.log("✅ Neo4j Connection Successful!");

    // Use a lightweight collection request as a Qdrant health check.
    const qdrantInfo = await qdrantClient.getCollections();
    console.log("✅ Qdrant Connection Successful!");
  } catch (error) {
    console.error("❌ Database Connection Failed:");
    console.error(error.message || error);
  } finally {
    // Close the driver when this module is executed directly so the process can exit cleanly.
    if (process.argv[1].endsWith("db.js")) {
      await neo4jDriver.close();
      console.log("🏁 Test complete.");
    }
  }
}

// Run the connection test automatically when this file is executed directly.
if (process.argv[1].endsWith("db.js")) {
  testConnections();
}
