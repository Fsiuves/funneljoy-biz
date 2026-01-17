import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Header } from '@/components/layout/Header';
import { KanbanBoard } from '@/components/leads/KanbanBoard';
import { AddLeadModal } from '@/components/leads/AddLeadModal';
import { useLeads, useCreateLead, useUpdateLeadStage } from '@/hooks/useLeads';
import { LeadStage, LeadSource } from '@/types/crm';
import { Loader2 } from 'lucide-react';

export default function Funnel() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { data: leads = [], isLoading } = useLeads();
  const createLead = useCreateLead();
  const updateStage = useUpdateLeadStage();

  const handleStageChange = (leadId: string, newStage: LeadStage) => {
    updateStage.mutate({ id: leadId, stage: newStage });
  };

  const handleAddLead = (leadData: {
    name: string;
    email: string;
    phone: string;
    company?: string;
    source: LeadSource;
    value?: number;
  }) => {
    createLead.mutate(leadData, {
      onSuccess: () => setIsModalOpen(false),
    });
  };

  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <Header 
        title="Funil de Vendas" 
        subtitle="Acompanhe o progresso dos seus leads"
        onAddClick={() => setIsModalOpen(true)}
        addButtonLabel="Novo Lead"
      />

      <KanbanBoard 
        leads={leads} 
        onStageChange={handleStageChange}
      />

      <AddLeadModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onAdd={handleAddLead}
        isLoading={createLead.isPending}
      />
    </MainLayout>
  );
}
