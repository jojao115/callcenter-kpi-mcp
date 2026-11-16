/** Mesma conexão, outro banco. */
export function trocarBanco(url: string, banco: string): string {
  const u = new URL(url);
  u.pathname = `/${banco}`;
  return u.toString();
}
