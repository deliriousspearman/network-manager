import { useState, useRef, useEffect } from 'react';
import { RotateCcw, Pipette } from 'lucide-react';
import { getStorage, setStorage } from '../../utils/storage';
import { usePopupClose } from '../../hooks/usePopupClose';

const COLOUR_HISTORY_KEY = 'colour-picker-history';
const MAX_COLOUR_HISTORY = 8;

export function getColourHistory(): string[] {
  try { return JSON.parse(getStorage(COLOUR_HISTORY_KEY, '[]')); }
  catch { return []; }
}

interface ColourPickerProps {
  /** Optional label rendered to the left of the trigger (e.g. "Border"). Omit to render a compact, label-less picker. */
  label?: string;
  value?: string;
  onChange: (c: string | null) => void;
  /** Controls the aligment of the popup relative to the trigger. Defaults to 'right'. */
  align?: 'left' | 'right';
  /** When true, the picker cannot be opened or edited. */
  disabled?: boolean;
}

/**
 * Shared colour picker used across the diagram.
 *
 * Features:
 *  - Trigger button shows the current colour as its background.
 *  - Custom CSS tooltip on hover ("Click to choose a colour" / current hex).
 *  - Popup with recent-colours history, native browser picker, and a hex input.
 *  - Clear/reset button.
 *  - Current hex shown prominently inside the popup.
 */
export function ColourPicker({ label, value, onChange, align = 'right', disabled = false }: ColourPickerProps) {
  const [open, setOpen] = useState(false);
  const [hexInput, setHexInput] = useState(value || '');
  const [pickerValue, setPickerValue] = useState(value || '#000000');
  const [history, setHistory] = useState<string[]>(getColourHistory);
  const ref = useRef<HTMLDivElement>(null);
  usePopupClose(open, ref, () => setOpen(false));

  useEffect(() => { setHexInput(value || ''); }, [value]);
  useEffect(() => { if (value) setPickerValue(value); }, [value]);

  const applyColour = (colour: string) => {
    onChange(colour);
    setHexInput(colour);
    setPickerValue(colour);
  };

  const commitToHistory = (colour: string) => {
    const updated = [colour, ...getColourHistory().filter(c => c !== colour)].slice(0, MAX_COLOUR_HISTORY);
    setStorage(COLOUR_HISTORY_KEY, JSON.stringify(updated));
    setHistory(updated);
  };

  const handleHexChange = (raw: string) => {
    const input = raw.startsWith('#') ? raw : `#${raw}`;
    setHexInput(input);
    if (/^#[0-9a-fA-F]{6}$/.test(input)) { applyColour(input); commitToHistory(input); }
  };

  const triggerTooltip = value
    ? `Colour picker — current ${value}`
    : 'Click to choose a colour';

  return (
    <div className="appearance-picker-row" ref={ref}>
      {label !== undefined && <span className="props-label">{label}</span>}
      <button
        className={`appearance-trigger colour-trigger has-swatch-tooltip${value ? ' has-colour' : ''}`}
        onClick={() => setOpen(o => !o)}
        disabled={disabled}
        aria-label={triggerTooltip}
        data-tooltip={triggerTooltip}
        style={value ? { backgroundColor: value, borderColor: value } : {}}
      >
        <Pipette size={13} />
      </button>
      {open && (
        <div className={`appearance-popup colour-picker-popup colour-picker-popup--${align}`}>
          <div className="colour-picker-popup-header">
            <span className="colour-picker-popup-title">Colour</span>
            <span className="colour-picker-popup-current">{value || 'none'}</span>
          </div>
          <div className="colour-picker-top-row">
            {history.map(c => (
              <button
                key={c}
                className={`colour-swatch has-swatch-tooltip${value === c ? ' active' : ''}`}
                style={{ backgroundColor: c }}
                onClick={() => { applyColour(c); commitToHistory(c); }}
                disabled={disabled}
                aria-label={c}
                data-tooltip={c}
              />
            ))}
            <input
              type="color"
              className="colour-picker-native-input has-swatch-tooltip"
              value={pickerValue}
              onChange={e => applyColour(e.target.value)}
              onBlur={() => commitToHistory(pickerValue)}
              disabled={disabled}
              aria-label="Open system colour picker"
              data-tooltip="Open system colour picker"
            />
          </div>
          <div className="colour-picker-hex-row">
            <input
              type="text"
              className="colour-picker-hex-input"
              value={hexInput}
              onChange={e => handleHexChange(e.target.value)}
              placeholder="#rrggbb"
              maxLength={7}
              spellCheck={false}
              readOnly={disabled}
            />
            {value && (
              <button
                className="colour-swatch reset has-swatch-tooltip"
                onClick={() => { onChange(null); setHexInput(''); setOpen(false); }}
                disabled={disabled}
                aria-label="Clear colour"
                data-tooltip="Clear colour"
              >
                <RotateCcw size={11} />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
