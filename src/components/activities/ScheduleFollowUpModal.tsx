import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { useUpdateLead } from '@/hooks/useLeads';
import { Lead } from '@/types/crm';
import { CalendarIcon, Loader2, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';

interface ScheduleFollowUpModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: Lead;
}

export function ScheduleFollowUpModal({ open, onOpenChange, lead }: ScheduleFollowUpModalProps) {
  const updateLead = useUpdateLead();
  
  const [followUpDate, setFollowUpDate] = useState<Date | undefined>(
    lead.nextFollowUp ? new Date(lead.nextFollowUp) : undefined
  );
  const [followUpTime, setFollowUpTime] = useState(
    lead.nextFollowUp ? format(lead.nextFollowUp, 'HH:mm') : '10:00'
  );

  // Reset when lead changes
  useEffect(() => {
    if (open) {
      setFollowUpDate(lead.nextFollowUp ? new Date(lead.nextFollowUp) : undefined);
      setFollowUpTime(lead.nextFollowUp ? format(lead.nextFollowUp, 'HH:mm') : '10:00');
    }
  }, [open, lead]);

  const handleSubmit = async () => {
    if (!followUpDate) return;

    try {
      const [hours, minutes] = followUpTime.split(':').map(Number);
      const followUpDateTime = new Date(followUpDate);
      followUpDateTime.setHours(hours, minutes, 0, 0);
      
      await updateLead.mutateAsync({
        id: lead.id,
        nextFollowUp: followUpDateTime,
      });

      toast({ 
        title: 'Follow-up agendado!', 
        description: `Retorno com ${lead.name} agendado para ${format(followUpDateTime, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}` 
      });
      onOpenChange(false);
    } catch (error) {
      // Error handled by mutation hook
    }
  };

  const handleRemoveFollowUp = async () => {
    try {
      await updateLead.mutateAsync({
        id: lead.id,
        nextFollowUp: null,
      });

      toast({ title: 'Follow-up removido!' });
      onOpenChange(false);
    } catch (error) {
      // Error handled by mutation hook
    }
  };

  const isLoading = updateLead.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Agendar Follow-up</DialogTitle>
        </DialogHeader>

        <div className="py-4">
          {/* Lead info */}
          <div className="flex items-center gap-3 p-3 bg-muted rounded-lg mb-6">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <span className="text-sm font-semibold text-primary">
                {lead.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
              </span>
            </div>
            <div>
              <p className="font-medium">{lead.name}</p>
              <p className="text-sm text-muted-foreground">{lead.company}</p>
            </div>
          </div>

          {/* Date & Time */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Data do retorno</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !followUpDate && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {followUpDate ? format(followUpDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR }) : "Selecione uma data"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={followUpDate}
                    onSelect={setFollowUpDate}
                    locale={ptBR}
                    disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label>Horário</Label>
              <div className="relative">
                <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  type="time"
                  value={followUpTime}
                  onChange={(e) => setFollowUpTime(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {lead.nextFollowUp && (
            <Button 
              variant="outline" 
              onClick={handleRemoveFollowUp} 
              disabled={isLoading}
              className="text-destructive hover:text-destructive"
            >
              Remover Follow-up
            </Button>
          )}
          <div className="flex gap-2 ml-auto">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={!followUpDate || isLoading}>
              {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Agendar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
