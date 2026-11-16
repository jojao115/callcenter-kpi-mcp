import type { DadosGerados } from '../src/seed/generate.js';
import { abandonado, finalizado } from './helpers.js';

/**
 * Base pequena, montada à mão, com resultados conferíveis de cabeça.
 * Semana de segunda 09/11/2026 a domingo 15/11/2026. Ids dos atendimentos: 1 a 8, na ordem.
 *
 *  id  empresa fila  operador  cliente  início (SP)        espera  duração  csat
 *  1   1       1     Ana       1001     ter 10/11 09:00    60s     600s     5
 *  2   1       1     Ana       1002     ter 10/11 09:30    120s    300s     4
 *  3   1       1     Bruno     1001     ter 10/11 15:00    30s     900s     2   ← rechamada do 1
 *  4   1       1     —         1003     ter 10/11 09:45    abandonou
 *  5   1       2     Carla     1004     qua 11/11 10:00    90s     240s     —
 *  6   2       3     Davi      2001     qua 11/11 10:00    300s    1200s    3
 *  7   2       3     —         2002     qua 11/11 23:30    abandonou (em UTC já é dia 12)
 *  8   1       1     Bruno     1001     qui 12/11 08:00    50s     400s     5   ← ~41h depois do 3
 */
export const fixture: DadosGerados = {
  empresas: [
    { id: 1, nome: 'Empresa Um' },
    { id: 2, nome: 'Empresa Dois' },
  ],
  filas: [
    { id: 1, empresaId: 1, nome: 'Suporte técnico' },
    { id: 2, empresaId: 1, nome: 'Financeiro' },
    { id: 3, empresaId: 2, nome: 'Suporte técnico' },
  ],
  operadores: [
    { id: 1, empresaId: 1, filaId: 1, nome: 'Ana', ativo: true },
    { id: 2, empresaId: 1, filaId: 1, nome: 'Bruno', ativo: true },
    { id: 3, empresaId: 1, filaId: 2, nome: 'Carla', ativo: true },
    { id: 4, empresaId: 2, filaId: 3, nome: 'Davi', ativo: true },
  ],
  atendimentos: [
    finalizado(
      { empresaId: 1, filaId: 1, operadorId: 1, clienteId: 1001 },
      '2026-11-10 09:00:00',
      60,
      600,
      5,
    ),
    finalizado(
      { empresaId: 1, filaId: 1, operadorId: 1, clienteId: 1002 },
      '2026-11-10 09:30:00',
      120,
      300,
      4,
    ),
    finalizado(
      { empresaId: 1, filaId: 1, operadorId: 2, clienteId: 1001 },
      '2026-11-10 15:00:00',
      30,
      900,
      2,
    ),
    abandonado({ empresaId: 1, filaId: 1, clienteId: 1003 }, '2026-11-10 09:45:00'),
    finalizado(
      { empresaId: 1, filaId: 2, operadorId: 3, clienteId: 1004 },
      '2026-11-11 10:00:00',
      90,
      240,
      null,
    ),
    finalizado(
      { empresaId: 2, filaId: 3, operadorId: 4, clienteId: 2001 },
      '2026-11-11 10:00:00',
      300,
      1200,
      3,
    ),
    abandonado({ empresaId: 2, filaId: 3, clienteId: 2002 }, '2026-11-11 23:30:00'),
    finalizado(
      { empresaId: 1, filaId: 1, operadorId: 2, clienteId: 1001 },
      '2026-11-12 08:00:00',
      50,
      400,
      5,
    ),
  ],
};

export const SEMANA = { data_inicio: '2026-11-09', data_fim: '2026-11-15' };
