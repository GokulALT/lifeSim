// src/components/StatBars.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatBars } from "./StatBars";

const stats = { happiness: 72, health: 85, smarts: 61, looks: 55 };

describe("StatBars", () => {
  it("renders all four stat labels", () => {
    render(<StatBars stats={stats} prevStats={null} />);
    expect(screen.getByText(/Happiness/i)).toBeInTheDocument();
    expect(screen.getByText(/Health/i)).toBeInTheDocument();
    expect(screen.getByText(/Smarts/i)).toBeInTheDocument();
    expect(screen.getByText(/Looks/i)).toBeInTheDocument();
  });

  it("renders stat values", () => {
    render(<StatBars stats={stats} prevStats={null} />);
    expect(screen.getByText("72")).toBeInTheDocument();
    expect(screen.getByText("85")).toBeInTheDocument();
  });

  it("shows green delta indicator for stat gains", () => {
    const prev = { happiness: 60, health: 85, smarts: 61, looks: 55 };
    render(<StatBars stats={stats} prevStats={prev} />);
    expect(screen.getByText("+12")).toBeInTheDocument();
  });

  it("shows red delta indicator for stat losses", () => {
    const prev = { happiness: 80, health: 85, smarts: 61, looks: 55 };
    render(<StatBars stats={stats} prevStats={prev} />);
    expect(screen.getByText("-8")).toBeInTheDocument();
  });
});
