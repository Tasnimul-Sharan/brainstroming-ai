import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  email: text("email").primaryKey(),
  displayName: text("display_name").notNull(),
  plan: text("plan").notNull().default("free"),
  dailyLimit: integer("daily_limit").notNull().default(50),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const conversations = sqliteTable(
  "conversations",
  {
    id: text("id").primaryKey(),
    userEmail: text("user_email")
      .notNull()
      .references(() => users.email, { onDelete: "cascade" }),
    title: text("title").notNull(),
    mode: text("mode").notNull().default("brainstorm"),
    shareToken: text("share_token"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    index("conversations_user_updated_idx").on(table.userEmail, table.updatedAt),
    uniqueIndex("conversations_share_token_idx").on(table.shareToken),
  ],
);

export const messages = sqliteTable(
  "messages",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    content: text("content").notNull(),
    attachmentIds: text("attachment_ids").notNull().default("[]"),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    feedback: text("feedback"),
    createdAt: integer("created_at").notNull(),
    editedAt: integer("edited_at"),
  },
  (table) => [
    index("messages_conversation_created_idx").on(
      table.conversationId,
      table.createdAt,
    ),
  ],
);

export const attachments = sqliteTable(
  "attachments",
  {
    id: text("id").primaryKey(),
    userEmail: text("user_email")
      .notNull()
      .references(() => users.email, { onDelete: "cascade" }),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    objectKey: text("object_key").notNull(),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    size: integer("size").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    index("attachments_user_conversation_idx").on(
      table.userEmail,
      table.conversationId,
    ),
  ],
);

export const dailyUsage = sqliteTable(
  "daily_usage",
  {
    id: text("id").primaryKey(),
    userEmail: text("user_email")
      .notNull()
      .references(() => users.email, { onDelete: "cascade" }),
    usageDate: text("usage_date").notNull(),
    requestCount: integer("request_count").notNull().default(0),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    estimatedCostMicros: integer("estimated_cost_micros").notNull().default(0),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("daily_usage_user_date_idx").on(
      table.userEmail,
      table.usageDate,
    ),
  ],
);

export const rateEvents = sqliteTable(
  "rate_events",
  {
    id: text("id").primaryKey(),
    userEmail: text("user_email").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("rate_events_user_created_idx").on(table.userEmail, table.createdAt)],
);
