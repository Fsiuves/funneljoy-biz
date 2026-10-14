import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, CheckCircle, XCircle, Loader2, Wifi, WifiOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const N8N_BASE = "https://n8n-automacoes-n8n.kjweev.easypanel.host/webhook";

type Status = "desconectado" | "conectando" | "conectado" | "verificando";

interface Unidade {
  id: string;
  unidade: string;
  instancia: string | null;
}

interface IntegrationSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Os endpoints evolution-qrcode e evolution-status exigem o token da sessao.
 * Do outro lado, o n8n consulta crm.wa_accounts com esse mesmo token, entao
 * quem autoriza e o RLS: a instancia so responde se pertencer ao tenant do
 * usuario e se o tenant tiver o modulo `atendimento`. Sem o cabecalho, 403.
 */
async function cabecalhoAuth(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function IntegrationSettingsModal({ open, onOpenChange }: IntegrationSettingsModalProps) {
  const [unidades, setUnidades] = useState<Unidade[]>([]);
  const [selecionada, setSelecionada] = useState<Unidade | null>(null);
  const [carregandoUnidades, setCarregandoUnidades] = useState(true);
  const [status, setStatus] = useState<Status>("verificando");
  const [qrBase64, setQrBase64] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const verificarStatus = useCallback(async (instancia: string): Promise<boolean> => {
    try {
      const res = await fetch(
        `${N8N_BASE}/evolution-status?instance=${encodeURIComponent(instancia)}`,
        { headers: await cabecalhoAuth() }
      );
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
    if (!selecionada?.instancia) return;
    setLoading(true);
    setErro(null);
    setQrBase64(null);
    try {
      const res = await fetch(
        `${N8N_BASE}/evolution-qrcode?instance=${encodeURIComponent(selecionada.instancia)}`,
        { headers: await cabecalhoAuth() }
      );
      if (res.status === 403) throw new Error("Você não tem acesso a este número.");
      if (!res.ok) throw new Error("Falha ao buscar QR Code");
      const data = await res.json();
      const base64: string | null = data?.base64 ?? data?.qrcode?.base64 ?? null;
      if (!base64) throw new Error("QR Code não disponível, tente novamente");
      setQrBase64(base64);
      setStatus("conectando");
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : "Erro desconhecido");
      setStatus("desconectado");
    } finally {
      setLoading(false);
    }
  };

  // Carrega os numeros do tenant. O RLS ja devolve so o que e dele.
  useEffect(() => {
    if (!open) return;
    let cancelado = false;
    (async () => {
      setCarregandoUnidades(true);
      setErro(null);
      const { data, error } = await (supabase as any)
        .from("wa_accounts")
        .select("id, unidade, instancia")
        .eq("ativo", true)
        .order("unidade");
      if (cancelado) return;
      if (error) {
        setErro("Não foi possível carregar os números.");
        setUnidades([]);
      } else {
        const lista = (data ?? []) as Unidade[];
        setUnidades(lista);
        setSelecionada(lista.length === 1 ? lista[0] : null);
      }
      setCarregandoUnidades(false);
    })();
    return () => { cancelado = true; };
  }, [open]);

  // Ao trocar de unidade, zera a tela e confere o estado daquela instancia.
  useEffect(() => {
    if (!open || !selecionada?.instancia) return;
    setQrBase64(null);
    setErro(null);
    setStatus("verificando");
    verificarStatus(selecionada.instancia);
  }, [open, selecionada, verificarStatus]);

  useEffect(() => {
    if (status !== "conectando" || !qrBase64 || !selecionada?.instancia) return;
    const instancia = selecionada.instancia;
    const interval = setInterval(async () => {
      const ok = await verificarStatus(instancia);
      if (ok) clearInterval(interval);
    }, 3000);
    return () => clearInterval(interval);
  }, [status, qrBase64, selecionada, verificarStatus]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Integrações</DialogTitle>
          <DialogDescription>Conecte o WhatsApp de cada unidade</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 pt-2">
          {carregandoUnidades && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando números...
            </div>
          )}

          {!carregandoUnidades && unidades.length === 0 && (
            <div className="rounded-lg border p-4 text-sm text-muted-foreground">
              Nenhum número de WhatsApp configurado para esta conta. Fale com a Dom Intelligence.
            </div>
          )}

          {unidades.length > 1 && (
            <div className="flex gap-2">
              {unidades.map((u) => (
                <Button
                  key={u.id}
                  size="sm"
                  variant={selecionada?.id === u.id ? "default" : "outline"}
                  onClick={() => setSelecionada(u)}
                  className="flex-1"
                >
                  {u.unidade}
                </Button>
              ))}
            </div>
          )}

          {selecionada && (
            <>
              <div className="flex items-center justify-between p-4 rounded-lg border bg-card">
                <div className="flex items-center gap-3">
                  {status === "conectado"
                    ? <Wifi className="h-5 w-5 text-green-600" />
                    : <WifiOff className="h-5 w-5 text-muted-foreground" />}
                  <div>
                    <p className="text-sm font-medium">WhatsApp: {selecionada.unidade}</p>
                    <p className="text-xs text-muted-foreground">Número de atendimento desta unidade</p>
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
                  WhatsApp da unidade {selecionada.unidade} conectado.
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
                        No celular da unidade {selecionada.unidade}, abra o WhatsApp, acesse{" "}
                        <strong>Dispositivos conectados</strong> e escaneie este código.
                        Ele expira em cerca de um minuto: se passar, toque em Atualizar QR Code.
                      </p>
                      {status === "conectando" && (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          Aguardando confirmação...
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {!carregandoUnidades && unidades.length > 1 && !selecionada && (
            <p className="text-sm text-muted-foreground">Escolha a unidade acima para conectar.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
