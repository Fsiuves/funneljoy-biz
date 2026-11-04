/** Campo crm.leads.cpf: só dígitos. Máscara na tela; CPF inválido fica gravado e a tela marca "a conferir". */
export function formatarCpf(valor: string): string {
  const n = valor.replace(/\D/g, '').slice(0, 11);
  if (n.length <= 3) return n;
  if (n.length <= 6) return `${n.slice(0, 3)}.${n.slice(3)}`;
  if (n.length <= 9) return `${n.slice(0, 3)}.${n.slice(3, 6)}.${n.slice(6)}`;
  return `${n.slice(0, 3)}.${n.slice(3, 6)}.${n.slice(6, 9)}-${n.slice(9)}`;
}

export function cpfValido(valor: string): boolean {
  const n = valor.replace(/\D/g, '');
  if (n.length !== 11 || /^(\d)\1+$/.test(n)) return false;
  return [9, 10].every((t) => {
    let soma = 0;
    for (let i = 0; i < t; i++) soma += Number(n[i]) * (t + 1 - i);
    return ((soma * 10) % 11) % 10 === Number(n[t]);
  });
}
