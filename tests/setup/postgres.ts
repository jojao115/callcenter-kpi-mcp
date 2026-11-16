import { readFile } from 'node:fs/promises';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import pg from 'pg';
import type { TestProject } from 'vitest/node';
import { trocarBanco } from './url.js';

declare module 'vitest' {
  export interface ProvidedContext {
    pgAdminUrl: string;
  }
}

/**
 * Prepara o Postgres dos testes e cria nele o banco "modelo" com o esquema.
 * Cada arquivo de teste clona o modelo num banco só dele, então os testes rodam em paralelo.
 *
 * Padrão: sobe um Postgres descartável com Testcontainers (precisa de Docker).
 * Sem Docker: TEST_PG_URL=postgres://usuario:senha@host:porta/postgres aponta para um
 * Postgres de teste, com usuário que pode criar bancos. Use só um servidor descartável.
 */
export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  let adminUrl = process.env.TEST_PG_URL;
  let parar = async () => {};
  if (!adminUrl) {
    const container = await new PostgreSqlContainer('postgres:17-alpine')
      .withDatabase('postgres')
      .start();
    adminUrl = container.getConnectionUri();
    parar = async () => {
      await container.stop();
    };
  }

  try {
    await criarModelo(adminUrl);
  } catch (err) {
    await parar();
    throw err;
  }

  project.provide('pgAdminUrl', adminUrl);
  return parar;
}

async function criarModelo(adminUrl: string): Promise<void> {
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  try {
    await admin.query('DROP DATABASE IF EXISTS modelo');
    await admin.query('CREATE DATABASE modelo');
  } finally {
    await admin.end();
  }

  const modelo = new pg.Client({ connectionString: trocarBanco(adminUrl, 'modelo') });
  await modelo.connect();
  try {
    await modelo.query(
      await readFile(new URL('../../db/init/01-schema.sql', import.meta.url), 'utf8'),
    );
  } finally {
    await modelo.end();
  }
}
