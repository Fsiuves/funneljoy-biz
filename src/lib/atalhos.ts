/**
 * Atalhos de teclado (pacote 2 das telas, 26/11/2026). Tecla de atalho não pode
 * roubar o que a pessoa está digitando: em campo de texto, só o Ctrl+K vale.
 */
export function campoDeTexto(alvo: EventTarget | null): boolean {
  if (!(alvo instanceof HTMLElement)) return false;
  return alvo.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(alvo.tagName);
}

/** Alguma janela, menu ou lista de opções aberta: os atalhos da tela ficam quietos. */
export const janelaAberta = () => !!document.querySelector('[role="dialog"], [role="menu"], [role="listbox"]');

/** O botão "Buscar" do menu abre a mesma busca do Ctrl+K. */
export const EVENTO_BUSCAR = 'crm:buscar';
export const abrirBusca = () => window.dispatchEvent(new Event(EVENTO_BUSCAR));
