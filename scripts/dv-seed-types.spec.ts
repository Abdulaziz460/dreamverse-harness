/** Compile video generation declarations, and `@dv/shot-render` with them, against the seed type of `defineGeneration`. */
import { resolve } from 'node:path'
import ts from 'typescript'
import { expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '..')
const probePath = resolve(import.meta.dirname, '__dv_seed_probe.ts')
const shotRenderPath = resolve(root, 'packages/dv/shot-render/src/index.ts')

const probe = `
import DvShotRender from '@dv/shot-render'
import { defineGeneration, type GenerationSpec } from '@dv/generation'
import type { RenderRequest } from '@dv/models'

declare const fields: Omit<GenerationSpec<'video'>, 'seed' | 'toRequest'>
declare const request: RenderRequest
const seeded = defineGeneration({ ...fields, toRequest: (_facts, _params, _inputs, seed) => ({ ...request, seed }) })
const seedless = defineGeneration({ ...fields, seed: false, toRequest: (_facts, _params, _inputs) => request })
// @ts-expect-error -- a declaration with seed: false receives no seed.
const seedRead = defineGeneration({ ...fields, seed: false, toRequest: (_facts, _params, _inputs, _seed) => request })
void [DvShotRender, seeded, seedless, seedRead]
`

it('gives a seeded video declaration a number seed, and no seed to a declaration with seed: false', { timeout: 60_000 }, () => {
  const parsed = ts.getParsedCommandLineOfConfigFile(resolve(root, 'tsconfig.host.json'), {}, {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic(diagnostic) {
      throw new Error(ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'))
    },
  })
  expect(parsed).toBeDefined()
  const options: ts.CompilerOptions = {
    ...parsed!.options,
    composite: false,
    incremental: false,
    noEmit: true,
    declaration: false,
    declarationMap: false,
  }
  const base = ts.createCompilerHost(options, true)
  const host: ts.CompilerHost = {
    ...base,
    fileExists: path => resolve(path) === probePath || base.fileExists(path),
    readFile: path => resolve(path) === probePath ? probe : base.readFile(path),
    getSourceFile(path, languageVersion, onError, shouldCreateNewSourceFile) {
      return resolve(path) === probePath
        ? ts.createSourceFile(path, probe, languageVersion, true)
        : base.getSourceFile(path, languageVersion, onError, shouldCreateNewSourceFile)
    },
  }
  const program = ts.createProgram([probePath], options, host)
  const sources = [program.getSourceFile(probePath)!, program.getSourceFile(shotRenderPath)]
  expect(sources[1], 'the program compiles the source of @dv/shot-render').toBeDefined()
  expect(sources.flatMap(source => [...program.getSyntacticDiagnostics(source), ...program.getSemanticDiagnostics(source)])
    .map((diagnostic) => {
      const line = diagnostic.file!.getLineAndCharacterOfPosition(diagnostic.start ?? 0).line + 1
      return `${diagnostic.file!.fileName === probePath ? 'probe' : 'shot-render'}:${line}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`
    })).toEqual([])
})
