import { Severity } from "../../entities/enums.js";
import type { RawEventData } from "../DataSourceAdapter.js";

const ADVISORIES: { level: number; label: string; severity: Severity; reason: string }[] = [
  { level: 1, label: "Exercise Normal Precautions", severity: Severity.INFO, reason: "Standard travel conditions with no elevated concerns" },
  { level: 2, label: "Exercise Increased Caution", severity: Severity.INFO, reason: "Elevated risk due to petty crime and occasional civil demonstrations" },
  { level: 2, label: "Exercise Increased Caution", severity: Severity.WARNING, reason: "Increased risk of terrorism and kidnapping in certain regions" },
  { level: 3, label: "Reconsider Travel", severity: Severity.WARNING, reason: "Ongoing civil unrest, crime, and limited government capacity" },
  { level: 3, label: "Reconsider Travel", severity: Severity.CRITICAL, reason: "Armed conflict in border regions and risk of arbitrary detention" },
  { level: 4, label: "Do Not Travel", severity: Severity.CRITICAL, reason: "Armed conflict, civil unrest, kidnapping, and terrorism throughout the country" },
];

const ADVISORY_COUNTRIES: { country: string; typical: number }[] = [
  { country: "France", typical: 1 },
  { country: "Japan", typical: 1 },
  { country: "Mexico", typical: 2 },
  { country: "Brazil", typical: 2 },
  { country: "Turkey", typical: 2 },
  { country: "Kenya", typical: 2 },
  { country: "Nigeria", typical: 3 },
  { country: "Pakistan", typical: 3 },
  { country: "Iraq", typical: 4 },
  { country: "Colombia", typical: 2 },
  { country: "Egypt", typical: 3 },
  { country: "India", typical: 2 },
  { country: "Philippines", typical: 2 },
  { country: "Ethiopia", typical: 3 },
  { country: "South Africa", typical: 2 },
  { country: "Saudi Arabia", typical: 2 },
  { country: "Jordan", typical: 2 },
  { country: "Israel", typical: 3 },
  { country: "Poland", typical: 1 },
  { country: "South Korea", typical: 1 },
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function generateMockAdvisories(count: number = 6): RawEventData[] {
  const used = new Set<string>();
  const events: RawEventData[] = [];

  for (let i = 0; i < count && i < ADVISORY_COUNTRIES.length; i++) {
    let entry = pick(ADVISORY_COUNTRIES);
    while (used.has(entry.country)) {
      entry = pick(ADVISORY_COUNTRIES);
    }
    used.add(entry.country);

    // Slight variation from typical level
    const variation = Math.random() < 0.3 ? (Math.random() < 0.5 ? 1 : -1) : 0;
    const level = Math.max(1, Math.min(4, entry.typical + variation));
    const advisory = ADVISORIES.find((a) => a.level === level) ?? ADVISORIES[0];
    const daysAgo = Math.floor(Math.random() * 30);

    events.push({
      title: `${entry.country}: Level ${level} — ${advisory.label}`,
      content: `The Department of State has issued a Level ${level} travel advisory for ${entry.country}: ${advisory.label}. ${advisory.reason}. U.S. citizens in ${entry.country} should review their personal security plans, remain aware of their surroundings, and monitor local media for updates.`,
      eventDate: new Date(Date.now() - daysAgo * 86400_000),
      severity: advisory.severity,
      category: "Travel Advisory",
      sourceUrl: `https://travel.state.gov/content/travel/en/international-travel/International-Travel-Country-Information-Pages/${entry.country.replace(/ /g, "")}.html`,
      metadata: {
        source: "State Department",
        country: entry.country,
        advisoryLevel: level,
        advisoryLabel: advisory.label,
        mock: true,
      },
      country: entry.country,
    });
  }
  return events;
}
