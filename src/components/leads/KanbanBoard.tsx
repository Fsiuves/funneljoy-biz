import { useMemo, useState } from 'react';
import { Lead, LeadStage } from '@/types/crm';
import { useEtapas, useVocabulario } from '@/hooks/useEmpresa';
import { LeadCard } from './LeadCard';

// Coluna com centenas de pacientes (994 em Novo contato na clínica) desenhava
// todos os cartões de uma vez: o funil demorava a abrir e arrastar travava. Cada
// coluna mostra os mais recentes e "Mostrar mais"; a busca procura em todos.
const POR_COLUNA = 50;

interface KanbanBoardProps {
  leads: Lead[];
  onLeadClick?: (lead: Lead) => void;
  onStageChange?: (leadId: string, newStage: LeadStage) => void;
}

export function KanbanBoard({ leads, onLeadClick, onStageChange }: KanbanBoardProps) {
  const { etapas, cor, carregando } = useEtapas();
  const v = useVocabulario();
  const [draggedLead, setDraggedLead] = useState<Lead | null>(null);
  const [wasDragging, setWasDragging] = useState(false);
  const [mostrar, setMostrar] = useState<Record<string, number>>({});

  const porEtapa = useMemo(() => {
    const m = new Map<string, Lead[]>();
    for (const lead of leads) {
      const lista = m.get(lead.stage);
      if (lista) lista.push(lead);
      else m.set(lead.stage, [lead]);
    }
    return m;
  }, [leads]);
  const getLeadsByStage = (stage: LeadStage) => porEtapa.get(stage) ?? [];

  const handleDragStart = (lead: Lead) => {
    setDraggedLead(lead);
    setWasDragging(true);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (stage: LeadStage) => {
    if (draggedLead && draggedLead.stage !== stage) {
      onStageChange?.(draggedLead.id, stage);
    }
    setDraggedLead(null);
  };

  const getTotalValue = (stage: LeadStage) => {
    const total = getLeadsByStage(stage).reduce((sum, lead) => sum + (lead.value || 0), 0);
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      notation: 'compact',
    }).format(total);
  };

  if (carregando) return null;

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {etapas.map((stage) => (
        <div
          key={stage.value}
          className="kanban-column animate-fade-in"
          onDragOver={handleDragOver}
          onDrop={() => handleDrop(stage.value)}
        >
          {/* Column Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: cor(stage.value) }}
              />
              <h3 className="font-semibold text-foreground">{stage.label}</h3>
              <span className="text-xs px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">
                {getLeadsByStage(stage.value).length}
              </span>
            </div>
            <span className="text-sm font-medium text-muted-foreground">
              {getTotalValue(stage.value)}
            </span>
          </div>

          {/* Cards */}
          <div className="space-y-3">
            {getLeadsByStage(stage.value).slice(0, mostrar[stage.value] ?? POR_COLUNA).map((lead) => (
              <div
                key={lead.id}
                draggable
                onDragStart={() => handleDragStart(lead)}
                onDragEnd={() => {
                  setDraggedLead(null);
                  // clear the drag flag on next tick so click handler sees it
                  setTimeout(() => setWasDragging(false), 0);
                }}
                className="animate-slide-up"
              >
                <LeadCard
                  lead={lead}
                  onClick={() => {
                    if (wasDragging) return;
                    onLeadClick?.(lead);
                  }}
                />
              </div>
            ))}
          </div>

          {getLeadsByStage(stage.value).length > (mostrar[stage.value] ?? POR_COLUNA) && (
            <button
              type="button"
              className="mt-3 w-full rounded-lg border border-dashed py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary"
              onClick={() => setMostrar((m) => ({ ...m, [stage.value]: (m[stage.value] ?? POR_COLUNA) + 100 }))}
            >
              Mostrar mais ({getLeadsByStage(stage.value).length - (mostrar[stage.value] ?? POR_COLUNA)})
            </button>
          )}

          {getLeadsByStage(stage.value).length === 0 && (
            <div className="text-center py-8 text-muted-foreground text-sm">
              {v.nenhum} nesta etapa
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
