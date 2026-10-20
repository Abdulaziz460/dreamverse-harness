/** `pnpm dv:owners`: print the owner package of every DreamVerse component key, reference kind, operation, skill and UI registration. */

import { listOwners, readScanFiles } from './dv-architecture.ts'

const COLUMNS = ['what', 'name', 'pkg', 'where', 'extra'] as const
const header = { what: 'what', name: 'name', pkg: 'package', where: 'where', extra: 'extra' }
const table: Array<Record<(typeof COLUMNS)[number], string>> = [header, ...listOwners(readScanFiles(process.cwd()))]
const widths = COLUMNS.map(column => Math.max(...table.map(row => row[column].length)))
for (const row of table) console.log(COLUMNS.map((column, index) => row[column].padEnd(widths[index] ?? 0)).join('  ').trimEnd())
