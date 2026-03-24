import { ChartJSNodeCanvas } from "chartjs-node-canvas";
import type { ChartConfiguration } from "chart.js";

const THREAT_SCORE: Record<string, number> = {
  LOW: 1,
  GUARDED: 2,
  ELEVATED: 3,
  HIGH: 4,
  SEVERE: 5,
};

const THREAT_COLORS: Record<string, string> = {
  LOW: "#2e8540",
  GUARDED: "#2e75b6",
  ELEVATED: "#e8a820",
  HIGH: "#e87722",
  SEVERE: "#d83933",
};

function getPointColor(score: number): string {
  if (score >= 5) return THREAT_COLORS.SEVERE;
  if (score >= 4) return THREAT_COLORS.HIGH;
  if (score >= 3) return THREAT_COLORS.ELEVATED;
  if (score >= 2) return THREAT_COLORS.GUARDED;
  return THREAT_COLORS.LOW;
}

interface AssessmentPoint {
  date: Date;
  threatLevel: string;
}

export async function generateThreatChart(
  assessments: AssessmentPoint[],
): Promise<Buffer> {
  const width = 1200;
  const height = 400;
  const canvas = new ChartJSNodeCanvas({ width, height, backgroundColour: "#ffffff" });

  // Sort by date ascending
  const sorted = [...assessments].sort(
    (a, b) => a.date.getTime() - b.date.getTime(),
  );

  const labels = sorted.map((a) =>
    a.date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
  );
  const data = sorted.map((a) => THREAT_SCORE[a.threatLevel] ?? 1);
  const pointColors = data.map(getPointColor);

  const config: ChartConfiguration = {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Threat Level",
          data,
          borderColor: "#1b3a5c",
          borderWidth: 2.5,
          backgroundColor: "rgba(27, 58, 92, 0.08)",
          fill: true,
          pointBackgroundColor: pointColors,
          pointBorderColor: pointColors,
          pointRadius: 5,
          pointHoverRadius: 7,
          tension: 0.3,
        },
      ],
    },
    options: {
      responsive: false,
      plugins: {
        legend: { display: false },
        title: { display: false },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            font: { size: 11 },
            color: "#71767a",
            maxRotation: 45,
          },
        },
        y: {
          min: 0.5,
          max: 5.5,
          ticks: {
            stepSize: 1,
            callback: (value) => {
              const labels: Record<number, string> = {
                1: "LOW",
                2: "GUARDED",
                3: "ELEVATED",
                4: "HIGH",
                5: "SEVERE",
              };
              return labels[value as number] ?? "";
            },
            font: { size: 11, weight: "bold" },
            color: (ctx) => {
              const colors: Record<number, string> = {
                1: THREAT_COLORS.LOW,
                2: THREAT_COLORS.GUARDED,
                3: THREAT_COLORS.ELEVATED,
                4: THREAT_COLORS.HIGH,
                5: THREAT_COLORS.SEVERE,
              };
              return colors[ctx.tick.value] ?? "#71767a";
            },
          },
          grid: {
            color: "rgba(0,0,0,0.06)",
            lineWidth: 1,
          },
        },
      },
      layout: {
        padding: { top: 10, bottom: 10, left: 10, right: 20 },
      },
    },
  };

  return await canvas.renderToBuffer(config);
}
