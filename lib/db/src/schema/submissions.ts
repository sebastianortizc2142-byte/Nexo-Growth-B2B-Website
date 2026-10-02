import { createInsertSchema } from "drizzle-zod";
import {
  boolean,
  index,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const submissionTypeEnum = pgEnum("submission_type", [
  "BUYER",
  "PROVIDER",
]);

export const submissionStatusEnum = pgEnum("submission_status", [
  "NEW",
  "CONTACTED",
  "QUALIFIED",
  "MATCHED",
  "CLOSED",
  "REJECTED",
]);

export const submissionsTable = pgTable(
  "submissions",
  {
    id: serial("id").primaryKey(),
    type: submissionTypeEnum("type").notNull(),
    name: text("name").notNull(),
    jobTitle: text("job_title").notNull(),
    company: text("company").notNull(),
    website: text("website"),
    email: text("email").notNull(),
    phone: text("phone").notNull(),
    industry: text("industry").notNull(),
    country: text("country").notNull(),
    city: text("city"),
    operatingRegions: text("operating_regions"),
    description: text("description"),
    timeline: text("timeline"),
    budget: text("budget"),
    productService: text("product_service"),
    problemSolved: text("problem_solved"),
    targetIndustries: text("target_industries"),
    customerSize: text("customer_size"),
    averageTicket: text("average_ticket"),
    idealCustomer: text("ideal_customer"),
    successFeeInterest: text("success_fee_interest"),
    source: text("source"),
    consent: boolean("consent").notNull().default(true),
    status: submissionStatusEnum("status").notNull().default("NEW"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("submissions_created_at_idx").on(table.createdAt),
    index("submissions_type_status_idx").on(table.type, table.status),
    index("submissions_email_company_created_idx").on(
      table.type,
      table.email,
      table.company,
      table.createdAt,
    ),
  ],
);

export const insertSubmissionSchema = createInsertSchema(submissionsTable).omit({
  id: true,
  createdAt: true,
  status: true,
});

export type InsertSubmission = typeof submissionsTable.$inferInsert;
export type Submission = typeof submissionsTable.$inferSelect;