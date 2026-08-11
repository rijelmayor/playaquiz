export type Role = "sales" | "admin" | "accounting" | "fabricator";

export type JobStatus =
  | "lead"
  | "site_visit"
  | "design_review"
  | "quoted"
  | "approved"
  | "in_production"
  | "installed"
  | "paid"
  | "closed"
  | "cancelled";

// Customer follow-up status — tracked separately from the operational
// pipeline status above (which drives commission/production automation).
// Sales sets this day-to-day; admin can edit/override any job's value.
export type FollowUpStatus = "follow_up" | "drawing" | "approved" | "other";

export type PaymentTerms = "50_50" | "full_on_completion" | "full_on_installation" | "custom";

export type PaymentScheduleDueStage = "approval" | "production" | "completion" | "installation" | "custom";
export type PaymentScheduleStatus = "pending" | "partial" | "paid";

export type SiteVisitStatus = "not_required" | "not_recorded" | "scheduled" | "completed" | "cancelled" | "rescheduled";

export interface PaymentSchedule {
  payment_schedule_id: string;
  job_id: string;
  sequence_no: number;
  label: string;
  percentage: number;
  amount: number;
  due_stage: PaymentScheduleDueStage;
  status: PaymentScheduleStatus;
  created_at: string;
  updated_at: string;
}

export const FOLLOW_UP_STATUS_LABELS: Record<FollowUpStatus, string> = {
  follow_up: "Follow Up",
  drawing: "Drawing",
  approved: "Approved",
  other: "Others"
};

export interface Job {
  job_id: string;
  client_id: string;
  booked_by: string;
  job_name: string | null;
  notes: string | null;
  status: JobStatus;
  follow_up_status: FollowUpStatus;
  follow_up_note: string | null;
  needs_site_visit: boolean;
  site_visit_status: SiteVisitStatus;
  site_visit_date: string | null;
  site_visit_by: string | null;
  site_visit_note: string | null;
  quoted_value: number | null;
  payment_terms: PaymentTerms;
  final_value: number | null;
  cancelled: boolean;
  cancel_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface Client {
  client_id: string;
  name: string;
  contact: string | null;
  location: string | null;
  email: string | null;
  created_at: string;
}

export interface JobOrder {
  job_order_id: string;
  job_id: string;
  fabricator_id: string | null;
  materials: string | null;
  estimated_materials_cost: number | null;
  actual_materials_cost: number | null;
  estimated_labor_cost: number | null;
  actual_labor_cost: number | null;
  estimated_logistics_cost: number | null;
  actual_logistics_cost: number | null;
  logistics_vendor: string | null;
  funds_release_status: "not_released" | "partially_released" | "fully_released" | "reconciled";
  deadline: string | null;
  status: "sourcing" | "in_production" | "qa" | "ready_for_install" | "installed";
}

export interface FundRelease {
  release_id: string;
  job_order_id: string;
  released_by: string;
  category: "materials" | "labor" | "logistics";
  amount: number;
  note: string | null;
  released_date: string;
}

export interface JobCommission {
  commission_id: string;
  job_id: string;
  agent_id: string;
  split_pct: number;
  amount: number | null;
  status: "pending" | "payable" | "paid" | "void";
  paid_date: string | null;
}

export type AttachmentCategory = "transaction" | "site_visit" | "approved_design" | "reference";

export interface JobAttachment {
  attachment_id: string;
  job_id: string;
  job_order_id: string | null;
  uploaded_by: string | null;
  category: AttachmentCategory;
  file_path: string;
  caption: string | null;
  created_at: string;
}

export interface QuotationItem {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
}

export interface Quotation {
  quotation_id: string;
  job_id: string;
  version: number;
  items: QuotationItem[];
  total: number;
  valid_until: string | null;
  valid_days: number;
  project_job_id: string | null;
  payment_terms: PaymentTerms;
  customer_name: string | null;
  terms: string | null;
  services_note: string | null;
  created_by: string | null;
  sent_at: string | null;
  sent_to: string | null;
  created_at: string;
}

export interface QuotationSettings {
  id: number;
  company_name: string;
  company_address: string;
  company_contact: string;
  social_media_account: string;
  email_address: string;
  website: string;
  services_note: string;
  terms: string;
  valid_days: number;
  updated_by: string | null;
  updated_at: string;
}

export interface Design {
  design_id: string;
  job_id: string;
  revision_no: number;
  status: "pending" | "approved" | "revision_requested";
  file_url: string | null;
  created_at: string;
}

export interface JobProfitability {
  job_id: string;
  status: JobStatus;
  final_value: number | null;
  materials_cost: number;
  labor_cost: number;
  logistics_cost: number;
  commission_cost: number;
  net_profit: number | null;
  margin_pct: number | null;
  is_estimated: boolean;
}
