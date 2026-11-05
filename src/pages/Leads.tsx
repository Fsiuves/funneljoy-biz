import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ErroAoCarregar } from '@/components/ErroAoCarregar';
import { MainLayout } from '@/components/layout/MainLayout';
import { Header } from '@/components/layout/Header';
import { AddLeadModal } from '@/components/leads/AddLeadModal';
import { EditLeadModal } from '@/components/leads/EditLeadModal';
import { LeadDetailsModal } from '@/components/leads/LeadDetailsModal';
import { useLeads, useCreateLead, useDeleteLead, useUpdateLead } from '@/hooks/useLeads';
import { Lead, LeadSource, LEAD_SOURCES } from '@/types/crm';
import { useConfig, useEtapas, useMeuPapel, useVocabulario } from '@/hooks/useEmpresa';
import { Phone, Mail, Building2, MoreHorizontal, Eye, Edit, Trash2, Loader2, Search, ArrowRightLeft } from 'lucide-react';
import { MudarEtapaDialog } from '@/components/leads/MudarEtapaDialog';
import { chaveNome } from '@/lib/busca';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function Leads() {
  const { rotulo, cor, personalizadas } = useEtapas();
  const [mudandoEtapa, setMudandoEtapa] = useState<Lead | null>(null);
  const v = useVocabulario();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  // Com 1.273 pacientes a tabela inteira de uma vez pesava e piscava por um minuto
  // (cada linha entrava com atraso pela posição). Mostra 100 por vez; a busca procura em todos.
  const [limite, setLimite] = useState(100);
  const comEmpresa = useConfig().config.formulario?.empresa !== false;
  const comCpf = useConfig().config.formulario?.cpf === true;
  const { data: papel } = useMeuPapel();
  const podeExcluir = papel === 'admin' || papel === 'manager';
  const [detailsLead, setDetailsLead] = useState<Lead | null>(null);
  const [editLead, setEditLead] = useState<Lead | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    const q = searchParams.get('q');
    if (q !== null) setSearchTerm(q);
  }, [searchParams]);
  
  const { data: leads = [], isLoading, isError, isFetching, refetch } = useLeads();
  const createLead = useCreateLead();
  const deleteLead = useDeleteLead();
  const updateLead = useUpdateLead();

  const filteredLeads = leads.filter((lead) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    const chave = chaveNome(searchTerm);
    const phoneDigits = searchTerm.replace(/\D/g, '');
    return (
      chaveNome(lead.name).includes(chave) ||
      (lead.email && lead.email.toLowerCase().includes(term)) ||
      (lead.company && lead.company.toLowerCase().includes(term)) ||
      // Pelo fim do número, sem a formatação: acha com ou sem 55 e com ou sem o 9.
      (phoneDigits.length >= 3 && lead.phone.replace(/\D/g, '').includes(phoneDigits.length >= 8 ? phoneDigits.slice(-8) : phoneDigits)) ||
      (phoneDigits.length >= 3 && lead.cpf?.includes(phoneDigits))
    );
  });

  const handleAddLead = (leadData: {
    name: string;
    email?: string;
    phone: string;
    company?: string;
    source: LeadSource;
    value?: number;
    unidade?: string;
    cpf?: string;
    endereco?: string;
  }) => {
    createLead.mutate(leadData, {
      onSuccess: () => setIsModalOpen(false),
    });
  };

  const handleDeleteLead = (id: string) => {
    if (confirm(`Tem certeza que deseja excluir ${v.este}?`)) {
      deleteLead.mutate(id);
    }
    setOpenMenuId(null);
  };

  const handleViewDetails = (lead: Lead) => {
    setDetailsLead(lead);
    setOpenMenuId(null);
  };

  const handleEditClick = (lead: Lead) => {
    setEditLead(lead);
    setOpenMenuId(null);
  };

  const getSourceLabel = (source: string) => {
    return LEAD_SOURCES.find(s => s.value === source)?.label || source;
  };

  const formatCurrency = (value?: number) => {
    if (!value) return '-';
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
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

  if (isError && leads.length === 0) {
    return (
      <MainLayout>
        <ErroAoCarregar oQue={`os ${v.leads}`} tentar={() => void refetch()} tentando={isFetching} />
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <Header 
        title={v.Leads} 
        subtitle="Gerencie todos os seus contatos"
        onAddClick={() => setIsModalOpen(true)}
        addButtonLabel={v.novo}
      />

      {/* Search */}
      <div className="mb-6 relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          placeholder={comEmpresa ? 'Buscar por nome, telefone, empresa...' : comCpf ? 'Buscar por nome, telefone ou CPF...' : 'Buscar por nome ou telefone...'}
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setLimite(100);
            if (searchParams.get('q')) {
              searchParams.delete('q');
              setSearchParams(searchParams, { replace: true });
            }
          }}
          className="input-field pl-10 w-full"
        />
      </div>

      {/* Table */}
      <div className="bg-card rounded-xl shadow-card overflow-hidden animate-fade-in">
        {filteredLeads.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-muted-foreground">{v.nenhum} cadastrado ainda.</p>
            <button
              onClick={() => setIsModalOpen(true)}
              className="mt-4 text-primary hover:underline"
            >
              Adicione {v.primeiro}
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left px-6 py-4 text-sm font-semibold text-foreground">{v.Lead}</th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-foreground">Contato</th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-foreground">Origem</th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-foreground">Etapa</th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-foreground">Valor</th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-foreground">Responsável</th>
                  <th className="text-left px-6 py-4 text-sm font-semibold text-foreground">Data</th>
                  <th className="text-right px-6 py-4 text-sm font-semibold text-foreground">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredLeads.slice(0, limite).map((lead, index) => (
                  <tr 
                    key={lead.id} 
                    className="border-b border-border hover:bg-muted/30 transition-colors animate-slide-up"
                    style={{ animationDelay: `${Math.min(index, 10) * 0.05}s` }}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <span className="text-sm font-semibold text-primary">
                            {lead.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-foreground truncate">{lead.name}</p>
                            {(lead as any).unidade && (
                              <span className="shrink-0 text-[11px] leading-none px-1.5 py-1 rounded border bg-muted text-muted-foreground">
                                {(lead as any).unidade}
                              </span>
                            )}
                          </div>
                          {lead.company && (
                            <p className="text-sm text-muted-foreground flex items-center gap-1 truncate">
                              <Building2 className="w-3 h-3 shrink-0" />
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
                        {lead.email && (
                        <p className="text-sm text-foreground flex items-center gap-2">
                          <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                          {lead.email}
                        </p>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-foreground">{getSourceLabel(lead.source)}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className="inline-block px-3 py-1 text-xs font-medium rounded-full text-white"
                        style={{ backgroundColor: cor(lead.stage) }}
                      >
                        {rotulo(lead.stage)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-medium text-foreground">{formatCurrency(lead.value)}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-foreground">
                        {lead.assignedToName || lead.createdByName || '-'}
                      </span>
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
                            <button
                              onClick={() => handleViewDetails(lead)}
                              className="w-full flex items-center gap-2 px-4 py-2 text-sm text-foreground hover:bg-muted transition-colors"
                            >
                              <Eye className="w-4 h-4" />
                              Ver detalhes
                            </button>
                            {personalizadas && (
                              <button
                                onClick={() => { setOpenMenuId(null); setMudandoEtapa(lead); }}
                                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-foreground hover:bg-muted transition-colors"
                              >
                                <ArrowRightLeft className="w-4 h-4" />
                                Mudar etapa
                              </button>
                            )}
                            <button
                              onClick={() => handleEditClick(lead)}
                              className="w-full flex items-center gap-2 px-4 py-2 text-sm text-foreground hover:bg-muted transition-colors"
                            >
                              <Edit className="w-4 h-4" />
                              Editar
                            </button>
                            {/* Atendente não exclui (a regra do banco só deixa direção e gerente). */}
                            {podeExcluir && <button
                              onClick={() => handleDeleteLead(lead.id)}
                              className="w-full flex items-center gap-2 px-4 py-2 text-sm text-destructive hover:bg-muted transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                              Excluir
                            </button>}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredLeads.length > limite && (
              <button
                type="button"
                className="w-full border-t border-border py-3 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/30"
                onClick={() => setLimite((l) => l + 100)}
              >
                Mostrar mais ({filteredLeads.length - limite})
              </button>
            )}
          </div>
        )}
      </div>

      <AddLeadModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onAdd={handleAddLead}
        isLoading={createLead.isPending}
        existingLeads={leads}
      />

      <LeadDetailsModal
        isOpen={!!detailsLead}
        onClose={() => setDetailsLead(null)}
        lead={detailsLead}
      />

      <EditLeadModal
        isOpen={!!editLead}
        onClose={() => setEditLead(null)}
        lead={editLead}
        isLoading={updateLead.isPending}
        onSave={(data) => {
          updateLead.mutate(data, {
            onSuccess: () => setEditLead(null),
          });
        }}
      />
      <MudarEtapaDialog
        lead={mudandoEtapa ? { id: mudandoEtapa.id, name: mudandoEtapa.name, stage: mudandoEtapa.stage, unidade: mudandoEtapa.unidade } : null}
        onClose={() => setMudandoEtapa(null)}
      />
    </MainLayout>
  );
}
