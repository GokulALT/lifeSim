import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import NewLifePage from "./page";

const fetchMock = vi.fn();

function fillAndSubmit() {
  fireEvent.change(screen.getByPlaceholderText("First Name"), { target: { value: "Sam" } });
  fireEvent.change(screen.getByPlaceholderText("Last Name"), { target: { value: "Lee" } });
  fireEvent.change(screen.getByPlaceholderText("Birth City"), { target: { value: "Sydney" } });
  fireEvent.click(screen.getByRole("button", { name: "Begin Life" }));
}

describe("NewLifePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("lists only packs that are not comingSoon", () => {
    render(<NewLifePage />);
    expect(screen.getByLabelText("Real Life")).toBeDefined();
    expect(screen.queryByText("Fantasy World (Coming Soon)")).toBeNull();
  });

  it("POSTs the form and navigates to the new game on 201", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 201, json: async () => ({ character: { _id: "abc" } }) });
    render(<NewLifePage />);
    fillAndSubmit();
    await waitFor(() => expect(push).toHaveBeenCalledWith("/game/abc"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/characters");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({
      firstName: "Sam", lastName: "Lee", birthCountry: "Australia", birthCity: "Sydney",
      gender: "male", sexuality: "heterosexual", packId: "core_realistic",
    });
  });

  it("shows the API error on a 403", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403, json: async () => ({ error: "DLC not unlocked" }) });
    render(<NewLifePage />);
    fillAndSubmit();
    expect(await screen.findByText("DLC not unlocked")).toBeDefined();
    expect(push).not.toHaveBeenCalled();
  });
});
