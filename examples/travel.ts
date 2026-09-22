import { createJevSorter } from "../src/index.js";

const sortForTrip = createJevSorter({
  context: {
    travelers: "Two adults who enjoy quiet nature walks and local history",
    constraints: "A rainy afternoon, no car, and limited energy after a long flight",
    location: "A fictional waterfront town; use only the descriptions supplied",
  },
});

const activities = [
  { name: "Ridge hike", description: "A steep, exposed four-hour hike; trailhead is a 40-minute drive away." },
  { name: "Harbor museum", description: "A small indoor museum about local maritime history, five minutes away on foot." },
  { name: "Garden stroll", description: "A quiet outdoor botanical garden, a short tram ride away." },
  { name: "Nightclub", description: "A busy late-night dance venue with loud music." },
];

const sorted = await sortForTrip(activities, "Best fit for these travelers this afternoon first");
console.table(sorted);
