import React from 'react';
import { Modal } from '@/ui/Modal';
import { SHORTCUT_GROUPS } from '@/hooks/useShortcuts';
import { shortcutKey } from '@/lib/shortcutLabels';

export interface CheatSheetProps {
  open: boolean;
  onClose: () => void;
}

export const CheatSheet: React.FC<CheatSheetProps> = ({ open, onClose }) => (
  <Modal open={open} onClose={onClose} title="Keyboard shortcuts">
    <p className="hint">
      {`Shortcuts pause while you type or a dialog is open — Esc and ${shortcutKey('Ctrl')} K always work.`}
    </p>
    <div className="cs-grid">
      {SHORTCUT_GROUPS.map((group) => (
        <div key={group.title}>
          <h3>{group.title}</h3>
          {group.rows.map((row) => (
            <div className="cs-row" key={row.id}>
              <span>{row.label}</span>
              <span className="cs-keys">
                {row.keys.map((key) => (
                  <kbd key={key}>{shortcutKey(key)}</kbd>
                ))}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
    <div className="row end" style={{ marginTop: 16 }}>
      <button type="button" className="btn ghost" onClick={onClose}>
        Close
      </button>
    </div>
  </Modal>
);
