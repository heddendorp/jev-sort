import { jevSort } from "../src/index.js";

const tickets = [
  { id: "UI-14", message: "The profile icon is slightly blurry." },
  { id: "PAY-22", message: "Checkout is failing for every customer. No payments have succeeded for an hour." },
  { id: "DOC-08", message: "Please add a dark mode screenshot to the getting-started guide." },
  { id: "AUTH-31", message: "A customer cannot sign in, but password reset works as a workaround." },
] as const;

const sorted = await jevSort(tickets, "Most urgent customer issue first", {
  context: {
    product: "An online store",
    policy: "Prioritize active loss of revenue, then blocked users. Cosmetic issues and documentation requests can wait.",
  },
  onProgress: ({ round, totalRounds, comparisons, requests }) => {
    console.error(`Stage ${round}/${totalRounds}: ${comparisons} comparisons in ${requests} requests`);
  },
});

console.table(sorted);
console.log("Original order:", tickets.map((ticket) => ticket.id).join(", "));
