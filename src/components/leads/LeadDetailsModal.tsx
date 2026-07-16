import { useEffect, useState } from 'react';
import { X, Loader2, Phone, MessageCircle, Mail, FileText, StickyNote, Building2 } from 'lucide-react';
import { Lead, LEAD_STEP_DEFS, LEAD_SOURCES, LEAD_STAGES, ActivityType } from '@/types/crm';
import { Button } from '@/components/ui/button';
import { useLeadSteps, useUpsertLeadStep } from '@/hooks/useLeadSteps';
import { useUpdateLead } from '@/hooks/useLeads';
import { useActivities, useCreateActivity } from '@/hooks/useActivities';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from '@/hooks/use-toast';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  lead: Lead | null;
}

const activityIcon: Record<ActivityType, React.ElementType> = {
  call: Phone, whatsapp: MessageCircle, email: Mail, meeting: FileText, note: StickyNote,
};

const formatCurrency = (v?: number) =>
  v ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v) : '-';

export function LeadDetailsModal({ isOpen, onClose, lead }: Props) {
  const [notes, setNotes] = useState('');
  const [stepMessages, setStepMessages] = useState<Record<string, string>>({});

  const { data: steps = [] } = useLeadSteps(lead?.id);
  const { data: activities = [] } = useActivities(lead?.id);
  const upsertStep = useUpsertLeadStep();
  const updateLead = useUpdateLead();
  const createActivity = useCreateActivity();
  const activeLeadId = lead?.id;

  useEffect(() => {
    if (!isOpen || !lead) {
      setNotes('');
      setStepMessages({});
      return;
    }

    setNotes(lead.notes || '');
    // Reset local step message edits whenever we switch leads,
    // otherwise messages from the previously opened lead leak in.
    setStepMessages({});
  }, [isOpen, activeLeadId, lead?.notes]);

  useEffect(() => {
    if (!isOpen || !activeLeadId) return;

    const map: Record<string, string> = {};
    steps.filter((s) => s.leadId === activeLeadId).forEach((s) => {
      map[s.stepKey] = s.message || '';
    });
    setStepMessages(map);
  }, [isOpen, activeLeadId, steps]);

  if (!isOpen || !lead) return null;

  const currentLeadSteps = steps.filter((s) => s.leadId === lead.id);
  const stepByKey = new Map(currentLeadSteps.map((s) => [s.stepKey, s]));
  const sourceLabel = LEAD_SOURCES.find((s) => s.value === lead.source)?.label || lead.source;
  const stageLabel = LEAD_STAGES.find((s) => s.value === lead.stage)?.label || lead.stage;

  const saveNotes = () => {
    updateLead.mutate(
      { id: lead.id, notes: notes || null },
      { onSuccess: () => toast({ title: 'Observação salva' }) }
    );
  };

  const toggleStep = async (stepKey: (typeof LEAD_STEP_DEFS)[number]['key'], done: boolean) => {
    const leadId = lead.id;
    const def = LEAD_STEP_DEFS.find((d) => d.key === stepKey)!;
    const message = stepMessages[stepKey] || '';
    await upsertStep.mutateAsync({ leadId, stepKey, done, message });
    if (done) {
      await createActivity.mutateAsync({
        leadId,
        type: def.activityType,
        description: message || def.label,
      });
    }
  };

  const saveStepMessage = async (stepKey: (typeof LEAD_STEP_DEFS)[number]['key']) => {
    const leadId = lead.id;
    const existing = stepByKey.get(stepKey);
    const def = LEAD_STEP_DEFS.find((d) => d.key === stepKey)!;
    const message = stepMessages[stepKey] || '';
    await upsertStep.mutateAsync({
      leadId,
      stepKey,
      done: existing?.done ?? false,
      message,
    });
    if (message) {
      await createActivity.mutateAsync({
        leadId,
        type: def.activityType,
        description: message,
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-foreground/20 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card rounded-2xl shadow-lg w-full max-w-3xl mx-4 max-h-[90vh] overflow-y-auto animate-scale-in">
        <div className="sticky top-0 bg-card flex items-center justify-between p-6 border-b border-border z-10">
          <h2 className="text-xl font-semibold text-foreground">Detalhes do Lead</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted transition-colors">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Basic info */}
          <div className="bg-muted/30 rounded-xl p-4">
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-lg font-semibold text-foreground">{lead.name}</p>
                {lead.company && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <Building2 className="w-3.5 h-3.5" /> {lead.company}
                  </p>
                )}
              </div>
              <span className="text-sm font-semibold text-success">{formatCurrency(lead.value)}</span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <p className="flex items-center gap-2 text-foreground"><Phone className="w-3.5 h-3.5 text-muted-foreground" /> {lead.phone}</p>
              {lead.email && <p className="flex items-center gap-2 text-foreground"><Mail className="w-3.5 h-3.5 text-muted-foreground" /> {lead.email}</p>}
              <p className="text-muted-foreground">Origem: <span className="text-foreground">{sourceLabel}</span></p>
              <p className="text-muted-foreground">Etapa: <span className="text-foreground">{stageLabel}</span></p>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">Observação</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="input-field min-h-[80px] w-full"
              placeholder="Ex: não tem site, não tem sistema..."
            />
            <div className="mt-2 flex justify-end">
              <Button size="sm" onClick={saveNotes} disabled={updateLead.isPending}>
                {updateLead.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Salvar observação'}
              </Button>
            </div>
          </div>

          {/* Checklist */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3">Sequência de contato</h3>
            <div className="space-y-3">
              {LEAD_STEP_DEFS.map((def) => {
                const step = stepByKey.get(def.key);
                const done = step?.done ?? false;
                return (
                  <div key={def.key} className="border border-border rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <label className="flex items-center gap-2 text-sm font-medium text-foreground cursor-pointer">
                        <input
                          type="checkbox"
                          checked={done}
                          onChange={(e) => toggleStep(def.key, e.target.checked)}
                          className="w-4 h-4 rounded border-border"
                        />
                        {def.label}
                      </label>
                      {step?.doneAt && (
                        <span className="text-xs text-muted-foreground">
                          {format(step.doneAt, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                        </span>
                      )}
                    </div>
                    <textarea
                      value={stepMessages[def.key] ?? ''}
                      onChange={(e) => setStepMessages((current) => ({ ...current, [def.key]: e.target.value }))}
                      onBlur={() => {
                        const original = step?.message || '';
                        if ((stepMessages[def.key] || '') !== original) {
                          saveStepMessage(def.key);
                        }
                      }}
                      className="input-field w-full min-h-[60px] text-sm"
                      placeholder="Cole aqui a mensagem enviada ou resumo da ligação..."
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Activity history */}
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-3">Histórico</h3>
            {activities.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma atividade registrada.</p>
            ) : (() => {
              // Sort ascending for chat feel
              const sorted = [...activities].sort(
                (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
              );
              const items = sorted.map((a) => {
                const isWa = a.type === 'whatsapp';
                const sentMatch = isWa && a.description.startsWith('[Auto - enviada]');
                const recvMatch = isWa && a.description.startsWith('[Auto - recebida]');
                const isChat = sentMatch || recvMatch;
                return { a, isChat, sent: sentMatch, recv: recvMatch };
              });

              const rendered: React.ReactNode[] = [];
              let chatBuffer: typeof items = [];
              const flushChat = (keyPrefix: string) => {
                if (chatBuffer.length === 0) return;
                rendered.push(
                  <div
                    key={`chat-${keyPrefix}`}
                    className="rounded-xl border border-border bg-[#e5ddd5] dark:bg-muted/40 p-3 space-y-2"
                  >
                    {chatBuffer.map(({ a, sent }) => {
                      const text = a.description
                        .replace(/^\[Auto - enviada\]\s?/, '')
                        .replace(/^\[Auto - recebida\]\s?/, '');
                      return (
                        <div
                          key={a.id}
                          className={`flex ${sent ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`max-w-[75%] rounded-lg px-3 py-2 shadow-sm ${
                              sent
                                ? 'bg-[#dcf8c6] text-foreground dark:bg-primary/20'
                                : 'bg-white text-foreground dark:bg-card'
                            }`}
                          >
                            <p className="text-sm whitespace-pre-wrap break-words">{text}</p>
                            <p className="text-[10px] text-muted-foreground mt-1 text-right">
                              {format(a.createdAt, "dd/MM HH:mm", { locale: ptBR })}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
                chatBuffer = [];
              };

              items.forEach((item, idx) => {
                if (item.isChat) {
                  chatBuffer.push(item);
                } else {
                  flushChat(`b${idx}`);
                  const Icon = activityIcon[item.a.type] || StickyNote;
                  rendered.push(
                    <div key={item.a.id} className="flex gap-3 p-3 bg-muted/30 rounded-lg">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Icon className="w-4 h-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground break-words">{item.a.description}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {format(item.a.createdAt, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                        </p>
                      </div>
                    </div>
                  );
                }
              });
              flushChat('end');

              return <div className="space-y-3">{rendered}</div>;
            })()}
          </div>
        </div>
      </div>
    </div>
  );
}