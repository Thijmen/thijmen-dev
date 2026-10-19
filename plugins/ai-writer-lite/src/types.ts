import type { PluginContext } from "emdash/plugin";

// The schema shapes ctx.schema returns; emdash/plugin doesn't export them by name.
type SchemaAccess = NonNullable<PluginContext["schema"]>;
export type CollectionSchemaInfo = NonNullable<Awaited<ReturnType<SchemaAccess["getCollection"]>>>;
export type FieldSchemaInfo = CollectionSchemaInfo["fields"][number];

type ContentAccess = NonNullable<PluginContext["content"]>;
export type ContentItem = NonNullable<Awaited<ReturnType<ContentAccess["get"]>>>;

export type ChatMessage = { role: "system" | "user"; content: string };
