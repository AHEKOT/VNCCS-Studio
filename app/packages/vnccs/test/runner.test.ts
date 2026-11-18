import { describe, expect, it, vi } from "vitest";
import {
  executionFailureMessage,
  isComfyTsEvent,
  startPrompt,
} from "../src/runner";

type Execution = Parameters<typeof executionFailureMessage>[0];

it("refreshes dynamic server choices before rejecting a request", async () => {
  const start = vi.fn().mockResolvedValue({});
  const host = {
    connect: vi.fn(),
    fetchAndUpdateSchema: vi.fn(),
    importApiJson: vi
      .fn()
      .mockReturnValueOnce({
        problems: [
          { title: "New character is missing from the cached choices" },
        ],
      })
      .mockReturnValueOnce({ problems: [], start }),
  };

  await startPrompt(host as unknown as Parameters<typeof startPrompt>[0], {});

  expect(host.fetchAndUpdateSchema).toHaveBeenCalledOnce();
  expect(start).toHaveBeenCalledOnce();
});

function failed(data: Record<string, unknown> | null): Execution {
  return {
    data: {
      error: data ? { type: "execution_error", data } : null,
    },
  } as unknown as Execution;
}

describe("executionFailureMessage", () => {
  it("names the failing node type with the server's exception text", () => {
    expect(
      executionFailureMessage(
        failed({
          exception_message: "aimdo memory compile error\n",
          node_type: "CharacterCreatorV2",
        })
      )
    ).toBe("CharacterCreatorV2: aimdo memory compile error");
  });

  it("keeps the message when the node type is missing", () => {
    expect(
      executionFailureMessage(failed({ exception_message: "Out of memory" }))
    ).toBe("Out of memory");
  });

  it("falls back to a generic reason without an error payload", () => {
    expect(executionFailureMessage(failed(null))).toBe("The run failed");
    expect(executionFailureMessage(failed({ exception_message: "  " }))).toBe(
      "The run failed"
    );
  });
});

describe("isComfyTsEvent", () => {
  const event = (type: unknown) => JSON.stringify({ type, data: {} });

  it("passes the events comfy-ts routes", () => {
    for (const type of ["status", "executing", "execution_error", "logs"]) {
      expect(isComfyTsEvent(event(type))).toBe(true);
    }
  });

  it("skips custom node broadcasts", () => {
    expect(isComfyTsEvent(event("vnccs.character_generator.stage"))).toBe(
      false
    );
    expect(isComfyTsEvent(event("vnccs_req_pose_sync"))).toBe(false);
  });

  it("leaves binary frames and unparsable text to comfy-ts", () => {
    expect(isComfyTsEvent(new ArrayBuffer(8))).toBe(true);
    expect(isComfyTsEvent("not json")).toBe(true);
    expect(isComfyTsEvent(JSON.stringify({ data: 1 }))).toBe(true);
  });
});
