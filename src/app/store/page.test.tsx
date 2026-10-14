import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import StorePage from "./page";

const fetchMock = vi.fn();

function jsonRes(body: unknown, ok = true, status = 200) {
  return Promise.resolve({ ok, status, json: () => Promise.resolve(body) });
}

describe("StorePage", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("loads unlockedDLCs and locks core_realistic on", async () => {
    fetchMock.mockReturnValueOnce(jsonRes({ unlockedDLCs: ["core_realistic"] }));
    render(<StorePage />);
    const boxes = await screen.findAllByRole("checkbox");
    await waitFor(() => expect(boxes[0]).toBeChecked());
    expect(boxes[0]).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledWith("/api/user/dlc");
  });

  it("disables the fantasy pack and shows Coming soon", async () => {
    fetchMock.mockReturnValueOnce(jsonRes({ unlockedDLCs: ["core_realistic", "fantasy_world_pack_v1"] }));
    render(<StorePage />);
    const boxes = await screen.findAllByRole("checkbox");
    await waitFor(() => expect(boxes[0]).toBeChecked());
    expect(boxes[1]).toBeDisabled();
    expect(boxes[1]).not.toBeChecked();
    expect(screen.getByText("Coming soon")).toBeInTheDocument();
  });

  it("POSTs the selection and shows Saved", async () => {
    fetchMock.mockReturnValueOnce(jsonRes({ unlockedDLCs: ["core_realistic"] }));
    render(<StorePage />);
    const boxes = await screen.findAllByRole("checkbox");
    await waitFor(() => expect(boxes[0]).toBeChecked());
    fetchMock.mockReturnValueOnce(jsonRes({ unlockedDLCs: ["core_realistic"] }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Saved ✓")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenLastCalledWith("/api/user/dlc", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ unlockedDLCs: ["core_realistic"] }),
    });
  });

  it("shows an error when saving fails", async () => {
    fetchMock.mockReturnValueOnce(jsonRes({ unlockedDLCs: ["core_realistic"] }));
    render(<StorePage />);
    const boxes = await screen.findAllByRole("checkbox");
    await waitFor(() => expect(boxes[0]).toBeChecked());
    fetchMock.mockReturnValueOnce(jsonRes({ error: "Unknown DLC IDs: x" }, false, 400));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Unknown DLC IDs: x")).toBeInTheDocument();
    expect(screen.queryByText("Saved ✓")).not.toBeInTheDocument();
  });
});
