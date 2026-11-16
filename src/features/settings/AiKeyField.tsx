import React, { useState } from 'react';
import { Button } from '@/ui/Button';
import { useAiKey } from '@/store';

/**
 * Optional passphrase protection for the web AI key. The default path writes
 * the key to the device secure store and unlocks automatically; enabling a
 * passphrase wraps it with PBKDF2 + AES-GCM and requires the passphrase after
 * a reload. Lost passphrases cannot be recovered, only replaced.
 */
export const AiKeyField: React.FC = () => {
  const {
    loaded,
    hasKey,
    locked,
    passphrase,
    error,
    setKey,
    clear,
    unlock,
    enablePassphrase,
    disablePassphrase,
    forgetPassphrase,
  } = useAiKey();
  const [draft, setDraft] = useState('');
  const [phrase, setPhrase] = useState('');
  const [showPhrase, setShowPhrase] = useState(false);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const save = async (): Promise<void> => {
    if (!draft.trim() || saving || !loaded) return;
    setSaving(true);
    setNote(null);
    await setKey(draft);
    setSaving(false);
    setDraft('');
    setNote('Key saved in secure storage on this device.');
  };

  const remove = async (): Promise<void> => {
    if (saving) return;
    setSaving(true);
    setNote(null);
    await clear();
    setSaving(false);
    setNote('Key removed from this device.');
  };

  const unlockKey = async (): Promise<void> => {
    if (!phrase || saving) return;
    setSaving(true);
    setNote(null);
    const ok = await unlock(phrase);
    setSaving(false);
    if (ok) {
      setPhrase('');
      setNote('Key unlocked for this session.');
    }
  };

  const protect = async (): Promise<void> => {
    if (!phrase.trim() || saving) return;
    setSaving(true);
    setNote(null);
    const ok = await enablePassphrase(phrase);
    setSaving(false);
    if (ok) {
      setPhrase('');
      setShowPhrase(false);
      setNote('Passphrase protection is on.');
    }
  };

  const unprotect = async (): Promise<void> => {
    if (saving) return;
    setSaving(true);
    setNote(null);
    const ok = await disablePassphrase();
    setSaving(false);
    if (ok) setNote('Passphrase protection removed.');
  };

  const forget = async (): Promise<void> => {
    if (saving) return;
    setSaving(true);
    setNote(null);
    await forgetPassphrase();
    setSaving(false);
    setPhrase('');
    setNote('Stored key removed. Paste a new key to continue.');
  };

  if (locked) {
    return (
      <div className="ai-key-field">
        <div className="ai-key-row">
          <input
            className="settings-input"
            type="password"
            aria-label="Key passphrase"
            autoComplete="current-password"
            placeholder="Enter the key passphrase"
            value={phrase}
            disabled={saving || !loaded}
            onChange={(event) => {
              setPhrase(event.target.value);
              setNote(null);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void unlockKey();
              }
            }}
          />
          <Button
            variant="secondary"
            size="sm"
            data-action="unlock-ai-key"
            onClick={() => void unlockKey()}
            disabled={!phrase || saving || !loaded}
          >
            Unlock
          </Button>
          <Button
            variant="ghost"
            size="sm"
            data-action="forget-ai-key"
            onClick={() => void forget()}
            disabled={saving}
          >
            Remove stored key
          </Button>
        </div>
        <p className="ai-key-status" data-ai-key-status={error ? 'error' : 'locked'}>
          {error ??
            'The key is locked for this session. Enter the passphrase to use AI features.'}
        </p>
        <p className="hint">
          The passphrase is never stored. If you lose it, the key cannot be recovered; remove
          it and paste a new one.
        </p>
      </div>
    );
  }

  return (
    <div className="ai-key-field">
      <div className="ai-key-row">
        <input
          className="settings-input"
          type="password"
          aria-label="AI API key"
          autoComplete="off"
          spellCheck={false}
          placeholder={hasKey ? 'Key saved — paste a new one to replace' : 'Paste your API key'}
          maxLength={512}
          value={draft}
          disabled={saving || !loaded}
          onChange={(event) => {
            setDraft(event.target.value);
            setNote(null);
          }}
        />
        <Button
          variant="secondary"
          size="sm"
          data-action="save-ai-key"
          onClick={() => void save()}
          disabled={!draft.trim() || saving || !loaded}
        >
          Save
        </Button>
        {hasKey ? (
          <Button
            variant="ghost"
            size="sm"
            data-action="clear-ai-key"
            onClick={() => void remove()}
            disabled={saving}
          >
            Remove
          </Button>
        ) : null}
      </div>
      <p
        className="ai-key-status"
        data-ai-key-status={error ? 'error' : hasKey ? 'saved' : 'empty'}
      >
        {error
          ? error
          : hasKey
            ? passphrase
              ? 'Saved with passphrase protection. The key is never synced.'
              : 'Saved securely on this device. The key is never synced.'
            : (note ?? 'Stored in secure storage, never in settings or the cloud.')}
      </p>

      {hasKey ? (
        passphrase ? (
          <div className="ai-key-passphrase">
            <p className="hint">Optional passphrase protection is on for this key.</p>
            <Button
              variant="ghost"
              size="sm"
              data-action="disable-ai-passphrase"
              onClick={() => void unprotect()}
              disabled={saving}
            >
              Remove passphrase protection
            </Button>
          </div>
        ) : (
          <div className="ai-key-passphrase">
            {showPhrase ? (
              <div className="ai-key-row">
                <input
                  className="settings-input"
                  type="password"
                  aria-label="New AI key passphrase"
                  autoComplete="new-password"
                  placeholder="Choose a passphrase"
                  value={phrase}
                  disabled={saving}
                  onChange={(event) => setPhrase(event.target.value)}
                />
                <Button
                  variant="secondary"
                  size="sm"
                  data-action="enable-ai-passphrase"
                  onClick={() => void protect()}
                  disabled={!phrase.trim() || saving}
                >
                  Protect key
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowPhrase(false);
                    setPhrase('');
                  }}
                  disabled={saving}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                data-action="show-ai-passphrase"
                onClick={() => setShowPhrase(true)}
                disabled={saving}
              >
                Add passphrase protection
              </Button>
            )}
            <p className="hint">
              Optional. A passphrase encrypts the key at rest with PBKDF2 and AES-GCM, so it
              must be entered after a reload. There is no recovery if it is lost. Without one,
              the key stays in this device’s secure storage and unlocks automatically.
            </p>
          </div>
        )
      ) : null}
    </div>
  );
};
