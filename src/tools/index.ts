import type { Ferramenta } from './_shared.js';
import { atendimentoDetalhe } from './atendimento_detalhe.js';
import { compararEmpresas } from './comparar_empresas.js';
import { csatPorOperador } from './csat_por_operador.js';
import { listarEmpresas } from './listar_empresas.js';
import { previsaoVolume } from './previsao_volume.js';
import { rankingOperadores } from './ranking_operadores.js';
import { rechamadas } from './rechamadas.js';
import { taxaAbandono } from './taxa_abandono.js';
import { tmePorPeriodo } from './tme_por_periodo.js';
import { volumePorHora } from './volume_por_hora.js';

export const ferramentas: readonly Ferramenta[] = [
  listarEmpresas,
  tmePorPeriodo,
  volumePorHora,
  csatPorOperador,
  rechamadas,
  rankingOperadores,
  previsaoVolume,
  atendimentoDetalhe,
  taxaAbandono,
  compararEmpresas,
];
