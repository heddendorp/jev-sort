import { TypeSafeClient } from "@typesafe-ai/sdk";
import { jevSort } from "../src/index.js";

const documents = [
  { id: 1, title: "Brand colors", excerpt: "Logo spacing and the official color palette.", internalNotes: "Not relevant to ranking" },
  { id: 2, title: "Webhook retries", excerpt: "Deduplicate webhook event IDs and retry transient failures with exponential backoff.", internalNotes: "Not relevant to ranking" },
  { id: 3, title: "Database backups", excerpt: "Restore a database from a daily snapshot after an incident.", internalNotes: "Not relevant to ranking" },
  { id: 4, title: "Webhook signatures", excerpt: "Verify the signature on the original request body before processing an incoming webhook.", internalNotes: "Not relevant to ranking" },
];

const client = new TypeSafeClient({ timeout: 15_000 });
const sorted = await jevSort(documents, "Most useful for answering the user's question first", {
  client,
  context: { question: "How do I safely handle duplicate webhook deliveries?", audience: "A backend engineer" },
  // Send only relevant fields; the returned objects still contain id and internalNotes.
  project: ({ title, excerpt }) => ({ title, excerpt }),
  batchSize: 64,
  concurrency: 4,
  signal: AbortSignal.timeout(60_000),
});

console.table(sorted.map(({ id, title }) => ({ id, title })));
