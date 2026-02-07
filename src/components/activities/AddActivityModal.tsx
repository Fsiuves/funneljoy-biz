import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { useLeads, useUpdateLead } from '@/hooks/useLeads';
import { useCreateActivity } from '@/hooks/useActivities';
import { ActivityType, Lead } from '@/types/crm';
import { Phone, MessageCircle, Mail, FileText, StickyNote, CalendarIcon, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

const activityTypes: { value: ActivityType; label: string; icon: React.ElementType }[] = [
  { value: 'call', label: 'Ligação', icon: Phone },
  { value: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
  { value: 'email', label: 'E-mail', icon: Mail },
  { value: 'meeting', label: 'Reunião', icon: FileText },
  { value: 'note', label: 'Anotação', icon: StickyNote },
];

interface AddActivityModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preSelectedLead?: Lead;
  preSelectedType?: ActivityType;
}

export function AddActivityModal({ 
  open, 
  onOpenChange, 
  preSelectedLead, 
  preSelectedType 
}: AddActivityModalProps) {
  const { data: leads = [] } = useLeads();
  const createActivity = useCreateActivity();
  const updateLead = useUpdateLead();

  const [selectedLeadId, setSelectedLeadId] = useState<string>(preSelectedLead?.id || '');
  const [activityType, setActivityType] = useState<ActivityType>(preSelectedType || 'call');
  const [description, setDescription] = useState('');
  const [scheduleFollowUp, setScheduleFollowUp] = useState(false);
  const [followUpDate, setFollowUpDate] = useState<Date>();
  const [followUpTime, setFollowUpTime] = useState('10:00');

  // Reset form when modal opens with new pre-selected values
  useState(() => {
    if (open) {
      setSelectedLeadId(preSelectedLead?.id || '');
      setActivityType(preSelectedType || 'call');
      setDescription('');
      setScheduleFollowUp(false);
      setFollowUpDate(undefined);
      setFollowUpTime('10:00');
    }
  });

  const handleSubmit = async () => {
    if (!selectedLeadId || !description.trim()) return;

    try {
      // Create the activity
      await createActivity.mutateAsync({
        leadId: selectedLeadId,
        type: activityType,
        description: description.trim(),
      });

      // Update follow-up if scheduled
      if (scheduleFollowUp && followUpDate) {
        const [hours, minutes] = followUpTime.split(':').map(Number);
        const followUpDateTime = new Date(followUpDate);
        followUpDateTime.setHours(hours, minutes, 0, 0);
        
        await updateLead.mutateAsync({
          id: selectedLeadId,
          nextFollowUp: followUpDateTime,
        });
      }

      // Reset and close
      setDescription('');
      setScheduleFollowUp(false);
      setFollowUpDate(undefined);
      onOpenChange(false);
    } catch (error) {
      // Error handled by mutation hooks
    }
  };

  const isLoading = createActivity.isPending || updateLead.isPending;
  const selectedLead = leads.find(l => l.id === selectedLeadId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Registrar Atividade</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Lead Selection */}
          {!preSelectedLead && (
            <div className="space-y-2">
              <Label>Lead</Label>
              <Select value={selectedLeadId} onValueChange={setSelectedLeadId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um lead" />
                </SelectTrigger>
                <SelectContent>
                  {leads.map((lead) => (
                    <SelectItem key={lead.id} value={lead.id}>
                      {lead.name} {lead.company && `- ${lead.company}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Show pre-selected lead info */}
          {preSelectedLead && (
            <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-sm font-semibold text-primary">
                  {preSelectedLead.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                </span>
              </div>
              <div>
                <p className="font-medium">{preSelectedLead.name}</p>
                <p className="text-sm text-muted-foreground">{preSelectedLead.company}</p>
              </div>
            </div>
          )}

          {/* Activity Type */}
          <div className="space-y-2">
            <Label>Tipo de Atividade</Label>
            <div className="grid grid-cols-5 gap-2">
              {activityTypes.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setActivityType(value)}
                  className={cn(
                    "flex flex-col items-center gap-1 p-3 rounded-lg border transition-all",
                    activityType === value 
                      ? "border-primary bg-primary/10 text-primary" 
                      : "border-border hover:border-primary/50"
                  )}
                >
                  <Icon className="w-5 h-5" />
                  <span className="text-xs">{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label>Descrição</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descreva o que foi conversado ou realizado..."
              rows={4}
            />
          </div>

          {/* Schedule Follow-up */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="scheduleFollowUp"
                checked={scheduleFollowUp}
                onChange={(e) => setScheduleFollowUp(e.target.checked)}
                className="rounded border-border"
              />
              <Label htmlFor="scheduleFollowUp" className="cursor-pointer">
                Agendar próximo retorno
              </Label>
            </div>

            {scheduleFollowUp && (
              <div className="flex gap-3 pl-6">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "justify-start text-left font-normal flex-1",
                        !followUpDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {followUpDate ? format(followUpDate, "dd/MM/yyyy", { locale: ptBR }) : "Data"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={followUpDate}
                      onSelect={setFollowUpDate}
                      locale={ptBR}
                      disabled={(date) => date < new Date()}
                    />
                  </PopoverContent>
                </Popover>

                <Input
                  type="time"
                  value={followUpTime}
                  onChange={(e) => setFollowUpTime(e.target.value)}
                  className="w-28"
                />
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancelar
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={!selectedLeadId || !description.trim() || isLoading}
          >
            {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Registrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
