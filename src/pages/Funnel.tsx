import { useState } from 'react';
import { toast } from 'sonner';
import { useEtapas, useVocabulario } from '@/hooks/useEmpresa';
import { ETAPA_PEDE_DATA, ETAPA_PEDE_VALOR, useMudarEtapa } from '@/hooks/useAgenda';
import { MudarEtapaDialog } from '@/components/leads/MudarEtapaDialog';
import { MainLayout } from '@/components/layout/MainLayout';
import { Header } from '@/components/layout/Header';
import { KanbanBoard } from '@/components/leads/KanbanBoard';
import { AddLeadModal } from '@/components/leads/AddLeadModal';
import { LeadDetailsModal } from '@/components/leads/LeadDetailsModal';
import { useLeads, useCreateLead, useUpdateLeadStage } from '@/hooks/useLeads';
import { Lead, LeadStage, LeadSource } from '@/types/crm';
import { Loader2 } from 'lucide-react';

export default function Funnel() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const { data: leads = [], isLoading } = useLeads();
  const createLead = useCreateLead();
  const updateStage = useUpdateLeadStage();
  const v = useVocabulario();
  const { personalizadas, rotulo } = useEtapas();
  const mudarEtapa = useMudarEtapa();
  const [mudando, setMudando] = useState<{ lead: Lead; etapa: string } | null>(null);
  const [busca, setBusca] = useState('');

  // Nas etapas da empresa, mudar passa pela Agenda (crm.mudar_etapa): agendou
  // pede dia e hora e fechou plano pede o valor. Sem etapas próprias (a Dom),
  // continua só trocando a etapa.
  const handleStageChange = (leadId: string, newStage: LeadStage) => {
    if (!personalizadas) {
      updateStage.mutate({ id: leadId, stage: newStage });
      return;
    }
    const lead = leads.find((l) => l.id === leadId);
    if (!lead) return;
    if (newStage === ETAPA_PEDE_DATA || newStage === ETAPA_PEDE_VALOR) {
      setMudando({ lead, etapa: newStage });
      return;
    }
    mudarEtapa.mutate(
      { leadId, etapa: newStage },
      {
        onSuccess: () => toast.success(`${lead.name}: ${rotulo(newStage)}`),
        onError: (e) => toast.error(e.message),
      },
    );
  };

  const termo = busca.trim().toLowerCase();
  const digitos = busca.replace(/\D/g, '');
  const visiveis = termo
    ? leads.filter((l) =>
        (l.name ?? '').toLowerCase().includes(termo) ||
        (digitos.length >= 3 && (l.phone ?? '').replace(/\D/g, '').includes(digitos)))
    : leads;

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
        title={v.funil} 
        subtitle={`Acompanhe cada ${v.lead} de etapa em etapa`}
        onAddClick={() => setIsModalOpen(true)}
        addButtonLabel={v.novo}
        busca={{ valor: busca, mudar: setBusca }}
      />

      {termo && (
        <p className="text-sm text-muted-foreground mb-3">
          {visiveis.length} {visiveis.length === 1 ? 'encontrado' : 'encontrados'} para "{busca.trim()}" ·{' '}
          <button className="underline" onClick={() => setBusca('')}>limpar busca</button>
        </p>
      )}

      <KanbanBoard 
        leads={visiveis} 
        onStageChange={handleStageChange}
        onLeadClick={(lead) => setSelectedLead(lead)}
      />

      <AddLeadModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onAdd={handleAddLead}
        isLoading={createLead.isPending}
      />

      <MudarEtapaDialog
        lead={mudando?.lead ?? null}
        etapa={mudando?.etapa}
        onClose={() => setMudando(null)}
      />

      <LeadDetailsModal
        isOpen={!!selectedLead}
        onClose={() => setSelectedLead(null)}
        lead={selectedLead}
      />
    </MainLayout>
  );
}
