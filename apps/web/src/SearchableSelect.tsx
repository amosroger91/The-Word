import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

export interface SelectOption {
  value: string;
  label: string;
  hint?: string;
  group?: string;
}

interface Props {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  label: string;
  filterPlaceholder: string;
  className?: string;
  compact?: boolean;
  // Short, self-evident lists (chapter numbers) do without a filter box.
  searchable?: boolean;
}

function fold(value: string) {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase();
}

export function SearchableSelect({ value, options, onChange, label, filterPlaceholder, className, compact, searchable = true }: Props) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = options.find((option) => option.value === value);
  const matches = useMemo(() => {
    const needle = fold(filter.trim());
    if (!needle) return options;
    return options.filter((option) => fold(`${option.label} ${option.hint ?? ''} ${option.group ?? ''}`).includes(needle));
  }, [options, filter]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setFilter('');
    setHighlight(Math.max(0, options.findIndex((option) => option.value === value)));
    (searchable ? inputRef.current : panelRef.current)?.focus();
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    listRef.current?.querySelector('[data-highlighted="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [open, highlight, matches]);

  function choose(option: SelectOption) {
    onChange(option.value);
    setOpen(false);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    // Close just this dropdown; a dialog behind it keeps its own Escape.
    if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); return; }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlight((current) => {
        const next = current + (event.key === 'ArrowDown' ? 1 : -1);
        return Math.min(matches.length - 1, Math.max(0, next));
      });
      return;
    }
    if (event.key === 'Enter' && matches[highlight]) {
      event.preventDefault();
      choose(matches[highlight]);
    }
  }

  let lastGroup: string | undefined;

  return (
    <div className={`combo ${compact ? 'combo-compact' : ''} ${className ?? ''}`} ref={rootRef}>
      <button
        type="button"
        className="combo-value"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((current) => !current)}
      >
        <span>{selected?.label ?? label}</span>
        <span className="combo-caret" aria-hidden="true">▾</span>
      </button>
      {open && (
        <div
          className="combo-panel"
          role="listbox"
          aria-label={label}
          ref={panelRef}
          tabIndex={searchable ? undefined : -1}
          onKeyDown={searchable ? undefined : onKeyDown}
        >
          {searchable && (
            <input
              ref={inputRef}
              className="combo-filter"
              value={filter}
              placeholder={filterPlaceholder}
              aria-label={`${label} — ${filterPlaceholder}`}
              onChange={(event) => { setFilter(event.target.value); setHighlight(0); }}
              onKeyDown={onKeyDown}
            />
          )}
          <div className="combo-options" ref={listRef}>
            {matches.map((option, index) => {
              const header = option.group && option.group !== lastGroup ? option.group : null;
              lastGroup = option.group;
              return (
                <div key={option.value}>
                  {header && <div className="combo-group">{header}</div>}
                  <button
                    type="button"
                    role="option"
                    aria-selected={option.value === value}
                    data-highlighted={index === highlight}
                    className={option.value === value ? 'combo-option selected' : 'combo-option'}
                    onMouseEnter={() => setHighlight(index)}
                    onClick={() => choose(option)}
                  >
                    {option.hint && <span className="combo-hint">{option.hint}</span>}
                    <span>{option.label}</span>
                  </button>
                </div>
              );
            })}
            {!matches.length && <p className="combo-empty">—</p>}
          </div>
        </div>
      )}
    </div>
  );
}
