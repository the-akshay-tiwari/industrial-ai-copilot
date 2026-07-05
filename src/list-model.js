import dotenv from "dotenv";

dotenv.config();

/**
 * Lists the generative and embedding models available to the configured API key.
 */
async function checkAvailableModels() {
  console.log("⏳ Fetching allowed models for your API key...");
  const apiKey = process.env.GEMINI_API_KEY;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
    );
    const data = await response.json();

    if (data.models) {
      console.log(
        "\n✅ SUCCESS! Here are the models your key can actually use:\n",
      );
      data.models.forEach((model) => {
        // Filter the response to generative and embedding models relevant to the application.
        if (
          model.supportedGenerationMethods.includes("generateContent") ||
          model.supportedGenerationMethods.includes("embedContent")
        ) {
          console.log(`👉 ${model.name.replace("models/", "")}`);
        }
      });
      console.log(
        "\n(These are the model names that can be used in the application code.)",
      );
    } else {
      console.error("❌ API Error:", data);
    }
  } catch (error) {
    console.error("❌ Fetch failed:", error);
  }
}

checkAvailableModels();
