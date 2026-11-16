#!/bin/bash
# Etiquetas do celular no CRM (crm-dom: supabase/sql/51-etiquetas-do-celular.sql e a
# função wa-etiquetas). Roda a cada minuto pelo cron do servidor da Evolution:
#   * * * * * /root/evolution-etiquetas/etiquetas.sh
# 1. pergunta à wa-etiquetas quais números estão no CRM (só esses são lidos);
# 2. tira o retrato das etiquetas desses números no banco da Evolution (retrato.sql);
# 3. manda quando o retrato mudou, ou a cada 10 minutos (conversa que nasceu depois
#    recebe a etiqueta que já tinha no celular).
# Config em /root/evolution-etiquetas/config (URL e SEGREDO; só o root lê).
# Registro em /var/log/evolution-etiquetas.log, só quando algo muda ou dá erro.
# Conferir sem mandar nada: DRY=1 /root/evolution-etiquetas/etiquetas.sh
set -u
DIR=/root/evolution-etiquetas
LOG=/var/log/evolution-etiquetas.log
BASE=${BASE:-n8n}   # banco da Evolution dentro do container evolution-api-db
registra() { printf '%s %s\n' "$(date -u +%FT%TZ)" "$(printf '%s' "$*" | tr '\n' ' ' | cut -c1-500)" >> "$LOG"; }

# Uma rodada por vez: se a anterior ainda estiver rodando, esta sai.
exec 9>/tmp/evolution-etiquetas.lock
flock -n 9 || exit 0
. "$DIR/config"

DB=$(docker ps --format '{{.Names}}' | grep -E 'evolution-api-db\.1\.' | head -1)
[ -n "$DB" ] || { registra "sem o banco da Evolution rodando"; exit 0; }

LISTA=$(curl -sS -f -m 20 -H "x-etiquetas-segredo: $SEGREDO" "$URL" 2>&1) || { registra "lista de números: $LISTA"; exit 0; }
RETRATO=$(docker exec -i -e LISTA="$LISTA" -e BASE="$BASE" "$DB" \
  sh -c 'psql -X -q -At -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$BASE" -v lista="$LISTA" -f -' < "$DIR/retrato.sql" 2>&1) \
  || { registra "retrato: $RETRATO"; exit 0; }
case "$RETRATO" in '{"instancias"'*) ;; *) registra "retrato estranho: $RETRATO"; exit 0 ;; esac

if [ "${DRY:-0}" = 1 ]; then
  printf 'números do CRM: %s\nretrato: %s bytes, %s etiquetas, %s conversas marcadas\n' "$LISTA" "${#RETRATO}" \
    "$(printf '%s' "$RETRATO" | grep -o '"nome"' | wc -l)" "$(printf '%s' "$RETRATO" | grep -o '"telefone"' | wc -l)"
  exit 0
fi

HASH=$(printf '%s' "$RETRATO" | sha256sum | cut -d' ' -f1)
AGORA=$(date +%s)
H_ANT=; T_ANT=0
[ -s "$DIR/ultimo" ] && read -r H_ANT T_ANT < "$DIR/ultimo"
[ "$H_ANT" = "$HASH" ] && [ $((AGORA - ${T_ANT:-0})) -lt 600 ] && exit 0

RESP=$(printf '%s' "$RETRATO" | curl -sS -f -m 60 -X POST -H "x-etiquetas-segredo: $SEGREDO" \
  -H "Content-Type: application/json" --data-binary @- "$URL" 2>&1) || { registra "envio: $RESP"; exit 0; }
printf '%s %s\n' "$HASH" "$AGORA" > "$DIR/ultimo"
if printf '%s' "$RESP" | grep -qE '"error"|"(etiquetas_novas_ou_mudadas|etiquetas_apagadas|marcacoes_postas|marcacoes_tiradas)":[1-9]'; then
  registra "$RESP"
fi
exit 0
