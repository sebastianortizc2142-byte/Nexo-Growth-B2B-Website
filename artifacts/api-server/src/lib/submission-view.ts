import type { AdminSubmission } from "@workspace/api-zod";
import type { Submission } from "@workspace/db";

export function toAdminSubmission(row: Submission): AdminSubmission {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    jobTitle: row.jobTitle,
    company: row.company,
    website: row.website,
    email: row.email,
    phone: row.phone,
    industry: row.industry,
    country: row.country,
    city: row.city,
    operatingRegions: row.operatingRegions,
    description: row.description,
    timeline: row.timeline,
    budget: row.budget,
    productService: row.productService,
    problemSolved: row.problemSolved,
    targetIndustries: row.targetIndustries,
    customerSize: row.customerSize,
    averageTicket: row.averageTicket,
    idealCustomer: row.idealCustomer,
    successFeeInterest: row.successFeeInterest,
    source: row.source,
    status: row.status,
    createdAt: row.createdAt,
  };
}