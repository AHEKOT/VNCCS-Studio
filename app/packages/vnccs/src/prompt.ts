/** A link to another node's output: `[nodeId, outputIndex]`. */
export type NodeLink = [nodeId: string, outputIndex: number];

export type InputValue = string | number | boolean | NodeLink;

export interface PromptNode {
  class_type: string;
  inputs: Record<string, InputValue>;
}

/** ComfyUI prompt (API) format, keyed by node id. */
export type ApiPrompt = Record<string, PromptNode>;

export function link(nodeId: string, outputIndex: number): NodeLink {
  return [nodeId, outputIndex];
}

/** Widgets store their state as JSON strings; accept either form. */
export function jsonInput(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}
