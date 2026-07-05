// Smoke test for the query endpoint used during local verification.
const testQuery = {
  query:
    "What is the Hydraulic Pump used for and what maintenance does it need?",
};

console.log(`Sending query: "${testQuery.query}"...\n`);

fetch("http://localhost:3000/api/query", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(testQuery),
})
  .then((response) => response.json())
  .then((data) => {
    console.log("🤖 AI Answer:\n");
    console.log(data.answer);
  })
  .catch((error) => console.error("Error connecting to API:", error));
