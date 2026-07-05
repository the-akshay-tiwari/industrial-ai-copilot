import dotenv from "dotenv";
import { qdrantClient, neo4jDriver } from "../config/db.js";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const mockAssets = [
  // Core machinery assets form the initial knowledge base for the demo.
  {
    id: "A001",
    name: "Hydraulic Pump",
    description:
      "High-pressure hydraulic pump used in the main assembly line. Requires daily fluid level and pressure checks to prevent cavitation.",
  },
  {
    id: "A002",
    name: "Conveyor Belt Motor",
    description:
      "Heavy-duty 500kW electric motor powering the primary transport conveyor. Susceptible to overheating under heavy continuous loads.",
  },
  {
    id: "A003",
    name: "Cooling Fan Unit",
    description:
      "Industrial cooling fan for the server and machinery room. Critical for temperature regulation and preventing thermal throttling.",
  },
  {
    id: "A004",
    name: "Automated Robotic Welding Arm",
    description:
      "6-axis robotic arm used for precision welding. Requires weekly calibration of optical sensors and lubrication of joint servos to maintain sub-millimeter accuracy.",
  },
  {
    id: "A005",
    name: "High-Flow Fuel Pump (16-Valve System)",
    description:
      "Specialized fuel delivery mechanism for high-capacity 16-valve generator engines. Routine maintenance involves checking fuel line connections for micro-leaks and replacing the primary filter every 500 hours.",
  },

  // IoT and compute assets provide the monitoring context for the industrial environment.
  {
    id: "A006",
    name: "IoT Thermal Sensor Array",
    description:
      "Network of smart sensors attached to heat-critical components. Automatically triggers emergency shutdown protocols if temperatures exceed 180°C. Needs monthly firmware updates via the central network.",
  },
  {
    id: "A007",
    name: "CNC Milling Machine",
    description:
      "Computer numerical control machine for cutting metal parts. The coolant reservoir must be flushed bi-weekly, and the spindle bearings require acoustic analysis to detect early wear.",
  },
  {
    id: "A008",
    name: "LOQ-7 SCADA Compute Node",
    description:
      "High-performance processing unit for industrial dashboards. Requires dedicated graphics driver updates and system taskbar diagnostics to maintain stable GUI monitoring operations.",
  },
  {
    id: "A009",
    name: "Central SCADA Control Panel",
    description:
      "Primary interface for monitoring all factory floor operations. Features redundant power supplies and requires biometric authentication for access.",
  },

  // Fabrication and heavy-processing assets expand the operational coverage of the index.
  {
    id: "A010",
    name: "Maharaja-Class Casting Forge",
    description:
      "Heavy-duty ornamental forge used for stamping wood-grain textures and traditional aesthetics onto metal gates. Requires precise handle-alignment calibration.",
  },
  {
    id: "A011",
    name: "Acoustic Resonance Calibrator",
    description:
      "Precision testing instrument for measuring tensile strength. Calibrated specifically to detect structural anomalies using A minor and F-sharp major harmonic frequencies.",
  },
  {
    id: "A012",
    name: "Automated Food-Grade Extruder",
    description:
      "Specialized processing unit for rapid mixing of dry materials (bhel/sev equivalents). Requires daily sanitization of the primary dispensing nozzles to prevent cross-contamination.",
  },
  {
    id: "A013",
    name: "Pneumatic Assembly Press",
    description:
      "Air-driven press used for fitting bearings into housings. The air compressor lines must be bled weekly to remove moisture buildup.",
  },

  // Utilities and power assets are included for safety and maintenance workflows.
  {
    id: "A014",
    name: "Three-Phase Power Transformer",
    description:
      "Steps down high-voltage grid power for factory use. The dielectric oil must be sampled and tested for dissolved gases every six months.",
  },
  {
    id: "A015",
    name: "Industrial HVAC Chiller",
    description:
      "Rooftop chilling unit providing climate control for the manufacturing floor. Condenser coils need to be power-washed quarterly.",
  },
  {
    id: "A016",
    name: "Centrifugal Water Pump",
    description:
      "Maintains water pressure for the facility's fire suppression system. Weekly test runs are mandatory to ensure immediate activation.",
  },

  // Logistics and sorting assets cover the downstream material flow operations.
  {
    id: "A017",
    name: "Magnetic Sorter Conveyor",
    description:
      "Uses electromagnets to separate ferrous and non-ferrous scrap materials. The magnetic belt requires weekly demagnetization cycles.",
  },
  {
    id: "A018",
    name: "Laser Cutting System",
    description:
      "High-wattage CO2 laser for cutting sheet metal. The focusing lenses must be cleaned daily with optical-grade solvent.",
  },
  {
    id: "A019",
    name: "Automated Packaging Carousel",
    description:
      "End-of-line system that wraps and labels finished pallets. Sensor lenses need dusting every shift to prevent labeling errors.",
  },
  {
    id: "A020",
    name: "Heavy-Duty Forklift Battery Charger",
    description:
      "Fast-charging station for warehouse vehicles. Requires regular inspection of cables for fraying and terminal cleaning to prevent electrical arcing.",
  },
];

/**
 * Generates a vector embedding for the provided text using the configured embedding model.
 */
async function generateEmbedding(text) {
  // The embedding model used here produces vectors with 3072 dimensions for compatibility with the active Qdrant collection.
  const model = genAI.getGenerativeModel({ model: "gemini-embedding-2" });
  const result = await model.embedContent(text);
  return result.embedding.values;
}

/**
 * Ingests the mock asset catalog into Qdrant and Neo4j so retrieval can be tested end to end.
 */
async function runIngestion() {
  console.log("🚀 Starting Data Ingestion...");
  const session = neo4jDriver.session();

  try {
    // Remove the previous collection before recreating it so the index starts from a clean state.
    try {
      await qdrantClient.deleteCollection("assets");
      console.log("🗑️ Deleted old 768-dimension Qdrant collection.");
    } catch (e) {
      console.log("ℹ️ No old collection found to delete.");
    }

    // Create a fresh Qdrant collection with the embedding size expected by the current model.
    await qdrantClient.createCollection("assets", {
      vectors: { size: 3072, distance: "Cosine" },
    });
    console.log(
      "✅ New Qdrant collection 'assets' created with 3072 dimensions.",
    );

    // Process each asset and store both the vector and graph node representation.
    for (let i = 0; i < mockAssets.length; i++) {
      const asset = mockAssets[i];
      console.log(`⏳ Processing ${asset.name}...`);

      const vector = await generateEmbedding(asset.description);

      await qdrantClient.upsert("assets", {
        wait: true,
        points: [
          {
            id: i + 1,
            vector: vector, // The generated vectors match the 3072-dimensional collection schema.
            payload: {
              assetId: asset.id,
              name: asset.name,
              description: asset.description,
            },
          },
        ],
      });

      await session.run(
        `MERGE (a:Asset {id: $id})
                 SET a.name = $name, a.description = $description`,
        { id: asset.id, name: asset.name, description: asset.description },
      );
    }

    console.log(
      "🎉 Data Ingestion Complete! Vectors in Qdrant & Nodes in Neo4j.",
    );
  } catch (error) {
    console.error("❌ Ingestion Error:", error);
  } finally {
    await session.close();
    await neo4jDriver.close();
    console.log("🏁 Closed all database connections safely.");
  }
}

runIngestion();
