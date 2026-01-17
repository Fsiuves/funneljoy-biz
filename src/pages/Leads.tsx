import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Header } from '@/components/layout/Header';
import { AddLeadModal } from '@/components/leads/AddLeadModal';
import { mockLeads } from '@/data/mockData';
import { Lead, LEAD_STAGES, LEAD_SOURCES } from '@/types/crm';
import { Phone, Mail, Building2, MoreHorizontal, Eye, Edit, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function Leads() {
  const [leads, setLeads] = useState<Lead[]>(mockLeads);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

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

  const getStageLabel = (stage: string) => {
    return LEAD_STAGES.find(s => s.value === stage)?.label || stage;
  };

  const getSourceLabel = (source: string) => {
    return LEAD_SOURCES.find(s => s.value === source)?.label || source;
  };

  const getStageBadgeClass = (stage: string) => {
    switch (stage) {
      case 'new': return 'badge-stage-new';
      case 'negotiation': return 'badge-stage-negotiation';
      case 'proposal': return 'badge-stage-proposal';
      case 'won': return 'badge-stage-won';
      case 'lost': return 'badge-stage-lost';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const formatCurrency = (value?: number) => {
    if (!value) return '-';
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  return (
    <MainLayout>
      <Header 
        title="Leads" 
        subtitle="Gerencie todos os seus contatos"
        onAddClick={() => setIsModalOpen(true)}
        addButtonLabel="Novo Lead"
      />

      {/* Table */}
      <div className="bg-card rounded-xl shadow-card overflow-hidden animate-fade-in">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-6 py-4 text-sm font-semibold text-foreground">Lead</th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-foreground">Contato</th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-foreground">Origem</th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-foreground">Etapa</th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-foreground">Valor</th>
                <th className="text-left px-6 py-4 text-sm font-semibold text-foreground">Data</th>
                <th className="text-right px-6 py-4 text-sm font-semibold text-foreground">Ações</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead, index) => (
                <tr 
                  key={lead.id} 
                  className="border-b border-border hover:bg-muted/30 transition-colors animate-slide-up"
                  style={{ animationDelay: `${index * 0.05}s` }}
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="text-sm font-semibold text-primary">
                          {lead.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium text-foreground">{lead.name}</p>
                        {lead.company && (
                          <p className="text-sm text-muted-foreground flex items-center gap-1">
                            <Building2 className="w-3 h-3" />
                            {lead.company}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="space-y-1">
                      <p className="text-sm text-foreground flex items-center gap-2">
                        <Phone className="w-3.5 h-3.5 text-muted-foreground" />
                        {lead.phone}
                      </p>
                      <p className="text-sm text-foreground flex items-center gap-2">
                        <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                        {lead.email}
                      </p>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-foreground">{getSourceLabel(lead.source)}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-block px-3 py-1 text-xs font-medium rounded-full ${getStageBadgeClass(lead.stage)}`}>
                      {getStageLabel(lead.stage)}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm font-medium text-foreground">{formatCurrency(lead.value)}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-sm text-muted-foreground">
                      {format(lead.createdAt, "dd/MM/yyyy", { locale: ptBR })}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="relative">
                      <button 
                        onClick={() => setOpenMenuId(openMenuId === lead.id ? null : lead.id)}
                        className="p-2 rounded-lg hover:bg-muted transition-colors"
                      >
                        <MoreHorizontal className="w-5 h-5 text-muted-foreground" />
                      </button>
                      {openMenuId === lead.id && (
                        <div className="absolute right-0 mt-2 w-40 bg-card rounded-lg shadow-lg border border-border z-10 animate-scale-in">
                          <button className="w-full flex items-center gap-2 px-4 py-2 text-sm text-foreground hover:bg-muted transition-colors">
                            <Eye className="w-4 h-4" />
                            Ver detalhes
                          </button>
                          <button className="w-full flex items-center gap-2 px-4 py-2 text-sm text-foreground hover:bg-muted transition-colors">
                            <Edit className="w-4 h-4" />
                            Editar
                          </button>
                          <button className="w-full flex items-center gap-2 px-4 py-2 text-sm text-destructive hover:bg-muted transition-colors">
                            <Trash2 className="w-4 h-4" />
                            Excluir
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <AddLeadModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onAdd={handleAddLead}
      />
    </MainLayout>
  );
}
