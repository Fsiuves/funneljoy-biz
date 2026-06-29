import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, CheckCircle, XCircle, Loader2, Wifi, WifiOff } from "lucide-react";

const N8N_BASE = "https://n8n-automacoes-n8n.kjweev.easypanel.host/webhook";

type Status = "desconectado" | "conectando" | "conectado" | "verificando";

interface IntegrationSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function IntegrationSettingsModal({ open, onOpenChange }: IntegrationSettingsModalProps) {
  const [status, setStatus] = useState<Status>("verificando");
  const [qrBase64, setQrBase64] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const verificarStatus = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch(`${N8N_BASE}/evolution-status`);
      const data = await res.json();
      const state: string = data?.instance?.state ?? data?.state ?? "";
      if (state === "open") {
        setStatus("conectado");
        setQrBase64(null);
        return true;
      }
      setStatus(state === "connecting" ? "conectando" : "desconectado");
      return false;
    } catch {
      setStatus("desconectado");
      return false;
    }
  }, []);

  const buscarQRCode = async () => {
    setLoading(true);
    setErro(null);
    setQrBase64(null);
    try {
      const res = await fetch(`${N8N_BASE}/evolution-qrcode`);
      if (!res.ok) throw new Error("Falha ao buscar QR Code");
      const data = await res.json();
      const base64: string | null = data?.base64 ?? data?.qrcode?.base64 ?? null;
      if (!base64) throw new Error("QR Code nao disponivel — tente novamente");
      setQrBase64(base64);
      setStatus("conectando");
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : "Erro desconhecido");
      setStatus("desconectado");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) verificarStatus();
  }, [open, verificarStatus]);

  useEffect(() => {
    if (status !== "conectando" || !qrBase64) return;
    const interval = setInterval(async () => {
      const ok = await verificarStatus();
      if (ok) clearInterval(interval);
    }, 3000);
    return () => clearInterval(interval);
  }, [status, qrBase64, verificarStatus]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Integracoes</DialogTitle>
          <DialogDescription>Conecte o WhatsApp ao SDR</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 pt-2">
          <div className="flex items-center justify-between p-4 rounded-lg border bg-card">
            <div className="flex items-center gap-3">
              {status === "conectado"
                ? <Wifi className="h-5 w-5 text-green-600" />
                : <WifiOff className="h-5 w-5 text-muted-foreground" />}
              <div>
                <p className="text-sm font-medium">WhatsApp — SDR</p>
                <p className="text-xs text-muted-foreground">Numero de envio do assistente de vendas</p>
              </div>
            </div>
            <div>
              {status === "conectado" && <Badge className="bg-green-100 text-green-800 border-green-200">Conectado</Badge>}
              {status === "conectando" && <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">Aguardando</Badge>}
              {status === "desconectado" && <Badge variant="destructive">Desconectado</Badge>}
              {status === "verificando" && <Badge variant="outline">Verificando...</Badge>}
            </div>
          </div>

          {status === "conectado" ? (
            <div className="flex items-center gap-2 text-green-700 text-sm">
              <CheckCircle className="h-4 w-4 shrink-0" />
              WhatsApp conectado. O SDR esta pronto para uso.
            </div>
          ) : (
            <>
              <Button onClick={buscarQRCode} disabled={loading} className="w-full" variant={qrBase64 ? "outline" : "default"}>
                {loading
                  ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Gerando QR Code...</>
                  : <><RefreshCw className="mr-2 h-4 w-4" />{qrBase64 ? "Atualizar QR Code" : "Conectar WhatsApp"}</>}
              </Button>

              {erro && (
                <div className="flex items-center gap-2 text-destructive text-sm">
                  <XCircle className="h-4 w-4 shrink-0" />
                  {erro}
                </div>
              )}

              {qrBase64 && (
                <div className="flex flex-col items-center gap-3">
                  <img src={qrBase64} alt="QR Code WhatsApp" className="w-52 h-52 rounded-lg border object-contain" />
                  <p className="text-xs text-muted-foreground text-center leading-relaxed">
                    Abra o WhatsApp, acesse <strong>Dispositivos conectados</strong> e escaneie este codigo.
                  </p>
                  {status === "conectando" && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Aguardando confirmacao...
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
