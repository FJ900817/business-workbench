// @vitest-environment jsdom
/** Explicit clipboard paste behavior for the write-only API-key field. */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiKeyField } from '../src/client/ApiKeyField.tsx'
import { en } from '../src/client/locales.ts'

let priorClipboard: PropertyDescriptor | undefined

afterEach(() => {
  cleanup()
  if (priorClipboard === undefined) Reflect.deleteProperty(navigator, 'clipboard')
  else Object.defineProperty(navigator, 'clipboard', priorClipboard)
  priorClipboard = undefined
})

const t = (key: keyof typeof en): string => en[key]

function installClipboard(readText: ReturnType<typeof vi.fn>): void {
  priorClipboard ??= Object.getOwnPropertyDescriptor(navigator, 'clipboard')
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { readText },
  })
}

describe('ApiKeyField', () => {
  it('reads a complete key from the clipboard only after its explicit action', async () => {
    const readText = vi.fn(() => Promise.resolve('sk-complete-key'))
    const onChange = vi.fn()
    installClipboard(readText)
    render(<ApiKeyField value="" onChange={onChange} disabled={false} placeholder="key" t={t} />)

    expect(readText).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: en.pasteKey }))

    await waitFor(() => { expect(onChange).toHaveBeenCalledWith('sk-complete-key') })
  })

  it('keeps the field unchanged and explains a rejected clipboard read', async () => {
    installClipboard(vi.fn(() => Promise.reject(new Error('denied'))))
    const onChange = vi.fn()
    render(<ApiKeyField value="" onChange={onChange} disabled={false} placeholder="key" t={t} />)

    fireEvent.click(screen.getByRole('button', { name: en.pasteKey }))

    expect(await screen.findByText(en.clipboardReadFailed)).toBeTruthy()
    expect(onChange).not.toHaveBeenCalled()
  })
})
