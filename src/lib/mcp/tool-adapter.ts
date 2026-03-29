/**
 * MCP → LangChain Tool Adapter
 *
 * Converts MCP tool definitions into LangChain DynamicStructuredTool instances
 * so they can be injected into ReAct agents transparently.
 */

import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { callMcpTool, type MCPTool } from "./client-manager";

/**
 * Converts an MCPTool into a LangChain DynamicStructuredTool.
 * The input schema is derived from the MCP tool's JSON Schema definition.
 */
export function mcpToolToLangchain(mcpTool: MCPTool): DynamicStructuredTool {
  const schema = buildZodSchema(mcpTool.inputSchema);

  return new DynamicStructuredTool({
    name: `mcp_${mcpTool.serverName.toLowerCase().replace(/\s+/g, "_")}_${mcpTool.name}`,
    description: `[MCP:${mcpTool.serverName}] ${mcpTool.description}`,
    schema,
    func: async (input: Record<string, unknown>) => {
      try {
        const result = await callMcpTool(mcpTool.serverConfigId, mcpTool.name, input);
        return typeof result === "string" ? result : JSON.stringify(result);
      } catch (err) {
        return `Error calling MCP tool ${mcpTool.name}: ${err instanceof Error ? err.message : String(err)}`;
      }
    },
  });
}

/**
 * Converts a list of MCPTools to LangChain tools.
 */
export function mcpToolsToLangchain(mcpTools: MCPTool[]): DynamicStructuredTool[] {
  return mcpTools.map(mcpToolToLangchain);
}

// ── JSON Schema → Zod conversion (simplified) ────────────────────────────────

function buildZodSchema(
  jsonSchema: Record<string, unknown>
): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const properties = (jsonSchema.properties as Record<string, unknown>) ?? {};
  const required = (jsonSchema.required as string[]) ?? [];

  const shape: Record<string, z.ZodTypeAny> = {};

  for (const [key, value] of Object.entries(properties)) {
    const prop = value as Record<string, unknown>;
    let zodType = jsonSchemaTypeToZod(prop);

    if (!required.includes(key)) {
      zodType = zodType.optional();
    }

    if (prop.description) {
      zodType = zodType.describe(prop.description as string);
    }

    shape[key] = zodType;
  }

  // If no properties defined, accept any object
  if (Object.keys(shape).length === 0) {
    return z.object({}).passthrough() as unknown as z.ZodObject<Record<string, z.ZodTypeAny>>;
  }

  return z.object(shape);
}

function jsonSchemaTypeToZod(prop: Record<string, unknown>): z.ZodTypeAny {
  const type = prop.type as string | undefined;

  switch (type) {
    case "string": {
      let s = z.string();
      if (prop.enum) {
        const values = prop.enum as [string, ...string[]];
        return z.enum(values);
      }
      return s;
    }
    case "number":
    case "integer":
      return z.number();
    case "boolean":
      return z.boolean();
    case "array": {
      const items = prop.items as Record<string, unknown> | undefined;
      const itemType = items ? jsonSchemaTypeToZod(items) : z.unknown();
      return z.array(itemType);
    }
    case "object": {
      const nested = buildZodSchema(prop as Record<string, unknown>);
      return nested;
    }
    default:
      return z.unknown();
  }
}
