import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import workflowExtension, { getWorkflowRegistry } from "../../../src/index.js";
import { createLassoCommands } from "./commands.js";

export default async function lassoExtension(pi: ExtensionAPI) {
  await workflowExtension(pi);

  const registry = getWorkflowRegistry();
  if (!registry) {
    return;
  }

  for (const command of createLassoCommands(registry)) {
    pi.registerCommand(command.name, command);
  }
}
