/** Write-only API-key input with an explicit clipboard read action. */

import { useState } from 'react'
import type { ReactNode } from 'react'
import type { en } from './locales.ts'
import styles from './ModelsSection.module.css'

/** Props for one API-key field. */
export interface ApiKeyFieldProps {
  /** Current unsaved key draft. */
  value: string
  /** Apply an updated key draft. */
  onChange: (value: string) => void
  /** Disable both the text field and clipboard action. */
  disabled: boolean
  /** Visible input placeholder. */
  placeholder: string
  /** Optional validation message key from the owning form. */
  failure?: keyof typeof en
  /** Localized Models-page copy. */
  t: (key: keyof typeof en) => string
  /** Make the input required for browser validation. */
  required?: boolean
  /** Focus the input on mount. */
  autoFocus?: boolean
}

/**
 * Render the secret input. The button avoids relying on a desktop shell to
 * forward the platform paste shortcut to an embedded Web view.
 * @param props - Field state and localized copy.
 * @returns The complete API-key field.
 */
export function ApiKeyField(props: ApiKeyFieldProps): ReactNode {
  const [clipboardFailure, setClipboardFailure] = useState(false)

  const pasteFromClipboard = (): void => {
    const clipboard = Reflect.get(navigator, 'clipboard') as { readText?: () => Promise<string> } | undefined
    if (typeof clipboard?.readText !== 'function') {
      setClipboardFailure(true)
      return
    }
    void clipboard.readText().then(
      (text) => {
        props.onChange(text)
        setClipboardFailure(false)
      },
      () => { setClipboardFailure(true) },
    )
  }

  const failure = props.failure ?? (clipboardFailure ? 'clipboardReadFailed' : undefined)
  return (
    <div className={styles['field']}>
      <div className={styles['keyLabelRow']}>
        <span className={styles['fieldLabel']}>{props.t('keyInput')}</span>
        <button
          className={styles['pasteKeyButton']}
          type="button"
          disabled={props.disabled}
          onClick={pasteFromClipboard}
        >
          {props.t('pasteKey')}
        </button>
      </div>
      <input
        className={styles['input']}
        type="password"
        autoComplete="off"
        value={props.value}
        placeholder={props.placeholder}
        aria-label={props.t('keyInput')}
        aria-invalid={failure !== undefined}
        required={props.required === true}
        autoFocus={props.autoFocus === true}
        disabled={props.disabled}
        onChange={(event) => {
          props.onChange(event.target.value)
          setClipboardFailure(false)
        }}
      />
      {failure === undefined ? null : <p className={styles['error']}>{props.t(failure)}</p>}
    </div>
  )
}
