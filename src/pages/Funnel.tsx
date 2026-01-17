import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Header } from '@/components/layout/Header';
import { KanbanBoard } from '@/components/leads/KanbanBoard';
import { AddLeadModal } from '@/components/leads/AddLeadModal';
import { mockLeads } from '@/data/mockData';
import { Lead, LeadStage } from '@/types/crm';

export default function Funnel() {
  const [leads, setLeads] = useState<Lead[]>(mockLeads);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleStageChange = (leadId: string, newStage: LeadStage) => {
    setLeads(leads.map(lead => 
      lead.id === leadId 
        ? { ...lead, stage: newStage, updatedAt: new Date() }
        : lead
    ));
  };

  const handleAddLead = (leadData: Omit<Lead, 'id' | 'createdAt' | 'updatedAt' | 'stage'>) => {
    const newLead: Lead = {
      ...leadData,
      id: Date.now().toString(),
      stage: 'new',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    setLeads([newLead, ...leads]);
  };

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
      />
    </MainLayout>
  );
}
