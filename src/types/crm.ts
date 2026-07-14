export type LeadSource = 'instagram' | 'ads' | 'website' | 'referral' | 'other';

export type LeadStage = 'new' | 'negotiation' | 'proposal' | 'won' | 'lost';

export type ActivityType = 'call' | 'whatsapp' | 'email' | 'meeting' | 'note';

export interface Lead {
  id: string;
  name: string;
  email?: string;
  phone: string;
  company?: string;
  source: LeadSource;
  stage: LeadStage;
  value?: number;
  createdAt: Date;
  updatedAt: Date;
  assignedTo?: string;
  assignedToName?: string;
  createdByName?: string;
  nextFollowUp?: Date;
  tags?: string[];
  notes?: string;
}

export type LeadStepKey =
  | 'ligacao_1'
  | 'ligacao_2'
  | 'follow_up_1'
  | 'follow_up_2'
  | 'follow_up_3'
  | 'follow_up_4'
  | 'follow_up_5';

export interface LeadStep {
  id: string;
  leadId: string;
  stepKey: LeadStepKey;
  done: boolean;
  message?: string;
  doneAt?: Date;
}

export const LEAD_STEP_DEFS: { key: LeadStepKey; label: string; activityType: ActivityType }[] = [
  { key: 'ligacao_1', label: 'Ligação 1', activityType: 'call' },
  { key: 'ligacao_2', label: 'Ligação 2', activityType: 'call' },
  { key: 'follow_up_1', label: 'Follow up 1', activityType: 'whatsapp' },
  { key: 'follow_up_2', label: 'Follow up 2', activityType: 'whatsapp' },
  { key: 'follow_up_3', label: 'Follow up 3', activityType: 'whatsapp' },
  { key: 'follow_up_4', label: 'Follow up 4', activityType: 'whatsapp' },
  { key: 'follow_up_5', label: 'Follow up 5', activityType: 'whatsapp' },
];

export interface Activity {
  id: string;
  leadId: string;
  type: ActivityType;
  description: string;
  createdAt: Date;
  createdBy: string;
}

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'manager' | 'sales';
  avatar?: string;
  leadsCount: number;
  conversions: number;
}

export interface DashboardMetrics {
  totalLeads: number;
  newLeadsThisMonth: number;
  conversionRate: number;
  avgClosingDays: number;
  totalRevenue: number;
  revenueThisMonth: number;
}

export const LEAD_SOURCES: { value: LeadSource; label: string }[] = [
  { value: 'instagram', label: 'Instagram' },
  { value: 'ads', label: 'Anúncios' },
  { value: 'website', label: 'Site' },
  { value: 'referral', label: 'Indicação' },
  { value: 'other', label: 'Outro' },
];

export const LEAD_STAGES: { value: LeadStage; label: string; color: string }[] = [
  { value: 'new', label: 'Novo Lead', color: 'stage-new' },
  { value: 'negotiation', label: 'Em Negociação', color: 'stage-negotiation' },
  { value: 'proposal', label: 'Proposta Enviada', color: 'stage-proposal' },
  { value: 'won', label: 'Fechou', color: 'stage-won' },
  { value: 'lost', label: 'Perdido', color: 'stage-lost' },
];
