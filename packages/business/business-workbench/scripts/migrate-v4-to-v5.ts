/** Explicit operator entry for the sole Business Workbench V4→V5 JSON migration. */

import { migrateBusinessWorkbenchV4JsonFile } from '../src/schema-v5-migration.ts'

function argument(name: string): string {
  const index = process.argv.indexOf(name)
  const value = index < 0 ? undefined : process.argv[index + 1]
  if (value === undefined || value.length === 0) throw new Error(`usage: ${name} <value>`)
  return value
}

const result = await migrateBusinessWorkbenchV4JsonFile({
  storagePath: argument('--storage'),
  expectedSourceHash: argument('--expected-sha256'),
})
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
