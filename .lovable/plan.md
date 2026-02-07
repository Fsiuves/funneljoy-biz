
# Plano: Consolidar Follow-ups e Atendimentos em Uma Única Tela

## Problema Atual
- Duas telas separadas para tarefas relacionadas
- Muitos cliques para realizar uma ação simples
- Usuário precisa navegar entre telas desnecessariamente

## Solução
Unificar tudo na tela de **Follow-ups**, que passará a ser a central de gestão de retornos e atividades.

---

## O Que Vai Mudar

### Na Tela de Follow-ups
A tela será aprimorada para permitir:
1. **Registrar atividades** diretamente (botão "Nova Atividade" no header)
2. **Ver histórico de atividades** em uma aba ou seção expansível
3. **Agendar novos follow-ups** para qualquer lead
4. **Gerenciar retornos pendentes** (como já faz)

### O Que Será Removido
1. Remover a página `/conversations` (Atendimentos)
2. Remover o link "Atendimentos" do menu lateral
3. Remover a rota do App.tsx

---

## Nova Estrutura da Tela de Follow-ups

```text
+------------------------------------------+
|  Follow-ups    [+ Nova Atividade] [Filtros]
|  Gerencie seus retornos e histórico      |
+------------------------------------------+
|                                          |
|  [Pendentes] [Histórico]     <- Abas     |
|                                          |
|  --- ABA PENDENTES (padrão) ---          |
|  Seções: Atrasados, Hoje, Amanhã, Semana |
|  Cards de leads com botões de ação       |
|                                          |
|  --- ABA HISTÓRICO ---                   |
|  Timeline de todas as atividades         |
|  realizadas (igual à tela Atendimentos)  |
+------------------------------------------+
```

---

## Benefícios
- Menos navegação entre telas
- Fluxo mais intuitivo: vejo os pendentes, registro a atividade, vejo o histórico
- Uma única tela para gerenciar toda a comunicação com leads

---

## Detalhes Técnicos

### Arquivos a Modificar

**src/pages/FollowUps.tsx**
- Adicionar sistema de abas: "Pendentes" e "Histórico"
- Mover lógica da aba Histórico (conteúdo de Conversations)
- Adicionar botão "Nova Atividade" no header
- Adicionar filtros por tipo de atividade no histórico

**src/App.tsx**
- Remover rota `/conversations`
- Remover import do Conversations

**src/components/layout/Sidebar.tsx**
- Remover item de menu "Atendimentos"

### Arquivos a Remover
- `src/pages/Conversations.tsx`

### Estrutura Final da Tela

| Aba | Conteúdo |
|-----|----------|
| **Pendentes** | Cards de leads organizados por data (Atrasados, Hoje, Amanhã, Semana) |
| **Histórico** | Timeline de atividades realizadas com filtros por tipo |

### Componentes Reutilizados
- `AddActivityModal` - já existe, será usado no botão "Nova Atividade"
- `ScheduleFollowUpModal` - já existe, disponível nos cards
- Hooks `useActivities` e `useLeads` - já existem
