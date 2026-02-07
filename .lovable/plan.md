
# Plano: Funcionalidades de Follow-ups e Atendimentos

## Objetivo
Tornar as telas de Follow-ups e Atendimentos funcionais, permitindo registrar atividades, agendar follow-ups e marcar tarefas como concluídas.

---

## O Que Cada Tela Faz

### Tela de Follow-ups
Mostra todos os leads que possuem um retorno agendado, organizados por:
- **Atrasados** - Follow-ups que já passaram da data
- **Hoje** - Retornos para hoje
- **Amanhã** - Retornos para amanhã
- **Esta Semana** - Retornos nos próximos 7 dias

### Tela de Atendimentos  
Exibe o histórico de todas as interações realizadas com os leads:
- Ligações telefônicas
- Mensagens de WhatsApp
- E-mails enviados
- Reuniões realizadas
- Anotações gerais

---

## Funcionalidades a Implementar

### 1. Modal de Registro de Atividade
Um formulário para registrar interações com leads:
- Selecionar o lead
- Escolher o tipo (Ligação, WhatsApp, E-mail, Reunião, Anotação)
- Escrever a descrição do que foi feito
- Opcionalmente agendar um próximo follow-up

### 2. Ações na Tela de Follow-ups
- **Botão Ligar**: Abre modal para registrar que uma ligação foi feita
- **Botão E-mail**: Abre modal para registrar que um e-mail foi enviado
- **Botão Concluído**: Marca o follow-up como realizado (limpa a data de próximo contato)

### 3. Botão "Nova Atividade" na Tela de Atendimentos
Adicionar um botão no cabeçalho para registrar novas atividades rapidamente.

---

## Detalhes Técnicos

### Novos Arquivos
```text
src/components/activities/
  AddActivityModal.tsx     # Modal para registrar atividades
  ScheduleFollowUpModal.tsx # Modal para agendar follow-ups
```

### Alterações em Arquivos Existentes

**src/hooks/useLeads.ts**
- Adicionar `useUpdateLead()` para atualizar campos do lead (incluindo `next_follow_up`)

**src/pages/FollowUps.tsx**
- Conectar os botões "Ligar", "E-mail" e "Concluído"
- Ao clicar em Ligar/E-mail: abrir modal de registro de atividade
- Ao clicar em Concluído: limpar o `next_follow_up` do lead

**src/pages/Conversations.tsx**
- Adicionar botão "Nova Atividade" no header
- Integrar o modal de registro de atividade

### Fluxo do Modal de Atividade
1. Usuário clica em "Ligar" no card de follow-up
2. Modal abre com o tipo "Ligação" pré-selecionado e o lead já escolhido
3. Usuário descreve o que foi conversado
4. Opcionalmente agenda um próximo retorno
5. Ao salvar:
   - Cria registro na tabela `activities`
   - Atualiza `next_follow_up` do lead (se agendado)
   - Atualiza as listas em tempo real

---

## Resumo das Mudanças

| O que | Onde | Resultado |
|-------|------|-----------|
| Modal de atividade | Novo componente | Registrar ligações, e-mails, etc |
| Botão Ligar | Follow-ups | Abre modal com tipo "ligação" |
| Botão E-mail | Follow-ups | Abre modal com tipo "e-mail" |
| Botão Concluído | Follow-ups | Remove o follow-up agendado |
| Botão Nova Atividade | Atendimentos | Registrar atividades manualmente |
| Hook useUpdateLead | useLeads.ts | Atualizar dados do lead |
