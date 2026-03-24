import { Severity } from "../../entities/enums.js";
import type { RawEventData } from "../DataSourceAdapter.js";

const HEADLINES: { title: string; severity: Severity; category: string }[] = [
  { title: "Diplomatic tensions rise over trade negotiations", severity: Severity.WARNING, category: "Diplomacy" },
  { title: "New bilateral security agreement signed", severity: Severity.INFO, category: "Security" },
  { title: "Protests near government district disrupt traffic", severity: Severity.WARNING, category: "Civil Unrest" },
  { title: "Embassy issues travel warning for upcoming holiday", severity: Severity.INFO, category: "Advisory" },
  { title: "Bomb threat evacuates commercial district", severity: Severity.CRITICAL, category: "Terrorism" },
  { title: "Political opposition leader detained amid protests", severity: Severity.WARNING, category: "Political" },
  { title: "Cyber attack targets government infrastructure", severity: Severity.CRITICAL, category: "Cyber" },
  { title: "Economic sanctions announced following human rights concerns", severity: Severity.WARNING, category: "Sanctions" },
  { title: "Military exercises conducted near disputed border region", severity: Severity.WARNING, category: "Military" },
  { title: "Cultural exchange program expanded between nations", severity: Severity.INFO, category: "Diplomacy" },
  { title: "Flood warnings issued for coastal regions", severity: Severity.WARNING, category: "Natural Disaster" },
  { title: "Major infrastructure project breaks ground in capital", severity: Severity.INFO, category: "Development" },
  { title: "Anti-government demonstrations enter second week", severity: Severity.CRITICAL, category: "Civil Unrest" },
  { title: "New visa restrictions announced for foreign nationals", severity: Severity.INFO, category: "Policy" },
  { title: "Armed robbery reported near diplomatic quarter", severity: Severity.WARNING, category: "Crime" },
  { title: "Peace talks resume after months of stalemate", severity: Severity.INFO, category: "Diplomacy" },
  { title: "Power grid failure causes widespread blackouts", severity: Severity.WARNING, category: "Infrastructure" },
  { title: "Journalists detained covering political rally", severity: Severity.WARNING, category: "Press Freedom" },
  { title: "Earthquake measuring 5.2 strikes near capital", severity: Severity.CRITICAL, category: "Natural Disaster" },
  { title: "New counter-terrorism cooperation agreement signed", severity: Severity.INFO, category: "Security" },
];

const COUNTRIES = [
  "Nigeria", "Ghana", "Ethiopia", "Kenya", "South Africa",
  "Japan", "South Korea", "Philippines", "Australia", "Thailand",
  "France", "Germany", "Turkey", "Poland", "United Kingdom",
  "Iraq", "Jordan", "Israel", "Saudi Arabia", "Egypt",
  "India", "Pakistan", "Kazakhstan", "Nepal", "Bangladesh",
  "Mexico", "Brazil", "Colombia", "Argentina", "Canada",
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function generateMockNews(count: number = 8): RawEventData[] {
  const events: RawEventData[] = [];
  for (let i = 0; i < count; i++) {
    const headline = pick(HEADLINES);
    const country = pick(COUNTRIES);
    const hoursAgo = Math.floor(Math.random() * 48);
    events.push({
      title: `${country}: ${headline.title}`,
      content: `Reports from ${country} indicate that ${headline.title.toLowerCase()}. Local authorities are monitoring the situation. Embassy personnel have been notified and are following standard security protocols. Further updates will be provided as the situation develops.`,
      eventDate: new Date(Date.now() - hoursAgo * 3600_000),
      severity: headline.severity,
      category: headline.category,
      sourceUrl: `https://news.google.com/search?q=${encodeURIComponent(country + " " + headline.category)}&hl=en`,
      metadata: { source: "NewsAPI", country, mock: true },
      country,
    });
  }
  return events;
}
