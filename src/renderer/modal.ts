// Reusable in-app form modal.
//
// Why this exists: Electron disables window.prompt() by default — every call
// returns null without showing anything, which made all our "+ Generate" and
// "Write with AI" buttons silently do nothing. This is a small dialog that
// renders inside the renderer (no shell.showMessageBox), so it lives inside
// the app's z-index stack and looks consistent with the rest of the UI.

export type ModalField =
  | {
      id: string;
      label: string;
      type: 'text';
      defaultValue?: string;
      placeholder?: string;
      required?: boolean;
    }
  | {
      id: string;
      label: string;
      type: 'textarea';
      defaultValue?: string;
      placeholder?: string;
      required?: boolean;
      rows?: number;
    }
  | {
      id: string;
      label: string;
      type: 'number';
      defaultValue?: number;
      placeholder?: string;
      min?: number;
      max?: number;
      required?: boolean;
    };

type ModalOptions = {
  title: string;
  description?: string;
  fields: ModalField[];
  submitLabel: string;
  submitTone?: 'fuchsia' | 'emerald';
};

export function openFormModal(
  opts: ModalOptions,
): Promise<Record<string, string> | null> {
  return new Promise((resolve) => {
    const panel = document.createElement('div');
    panel.className = 'fixed inset-0 z-50 flex items-center justify-center';
    panel.style.background = 'rgba(8, 9, 10, 0.72)';
    panel.style.backdropFilter = 'blur(2px)';

    panel.innerHTML = `
      <div data-backdrop class="absolute inset-0"></div>
      <div class="relative grain"
           style="width: 560px; max-width: 92vw; max-height: 86vh; overflow-y: auto; background: var(--color-surface); border: 1px solid var(--color-hairline); padding: 28px 28px 24px; box-shadow: 0 24px 80px -20px rgba(0,0,0,0.6);">
        <div class="caption mb-2">${escapeHtml(opts.submitLabel.toUpperCase())}</div>
        <div class="flex items-start justify-between gap-3" style="padding-bottom: 14px; border-bottom: 1px solid var(--color-hairline);">
          <div class="min-w-0">
            <h2 class="font-display" style="font-size: 24px; font-weight: 500; letter-spacing: -0.015em; line-height: 1.1; color: var(--color-text);">${escapeHtml(opts.title)}</h2>
            ${
              opts.description
                ? `<p style="font-size: 13px; color: var(--color-muted); margin-top: 8px; line-height: 1.5;">${escapeHtml(opts.description)}</p>`
                : ''
            }
          </div>
          <button data-cancel aria-label="Close"
                  style="font-size: 18px; line-height: 1; color: var(--color-muted); background: transparent; border: 0; cursor: pointer; padding: 4px 6px;">&times;</button>
        </div>
        <form data-form class="space-y-4" style="padding-top: 18px;">
          ${opts.fields.map(renderField).join('')}
          <div class="flex justify-end gap-2" style="padding-top: 8px;">
            <button type="button" data-cancel class="btn-ghost">Cancel</button>
            <button type="submit" class="btn-primary">${escapeHtml(opts.submitLabel)}</button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(panel);

    const firstField = panel.querySelector<
      HTMLInputElement | HTMLTextAreaElement
    >('[data-field]');
    // rAF gives the layout engine a tick before we steal focus, otherwise
    // the first tab-key press sometimes targets the wrong control.
    requestAnimationFrame(() => firstField?.focus());

    const close = (result: Record<string, string> | null): void => {
      document.removeEventListener('keydown', onKeydown);
      panel.remove();
      resolve(result);
    };

    const onKeydown = (ev: KeyboardEvent): void => {
      if (ev.key === 'Escape') {
        ev.preventDefault();
        close(null);
      }
    };
    document.addEventListener('keydown', onKeydown);

    panel
      .querySelectorAll<HTMLElement>('[data-cancel], [data-backdrop]')
      .forEach((el) => el.addEventListener('click', () => close(null)));

    panel
      .querySelector<HTMLFormElement>('[data-form]')!
      .addEventListener('submit', (ev) => {
        ev.preventDefault();
        const result: Record<string, string> = {};
        for (const f of opts.fields) {
          const el = panel.querySelector<
            HTMLInputElement | HTMLTextAreaElement
          >(`[name="${f.id}"]`);
          if (!el) continue;
          const raw = el.value;
          const val = f.type === 'textarea' ? raw : raw.trim();
          if (f.required && !val) {
            el.focus();
            el.classList.add('ring-1', 'ring-red-500');
            return;
          }
          result[f.id] = val;
        }
        close(result);
      });
  });
}

function renderField(f: ModalField): string {
  const name = `name="${f.id}"`;
  const id = `id="field-${f.id}"`;
  const placeholder = f.placeholder
    ? `placeholder="${escapeHtml(f.placeholder)}"`
    : '';
  const required = f.required ? 'required' : '';
  // Inputs/textarea/select get their visual treatment from the global
  // typeface block in index.css. Width 100% via inline style.
  const cls = 'w-full';
  const labelBlock = `<label for="field-${f.id}" class="caption" style="display: block; margin-bottom: 6px;">${escapeHtml(f.label)}</label>`;

  switch (f.type) {
    case 'textarea': {
      const rows = f.rows ?? 3;
      const def = escapeHtml(f.defaultValue ?? '');
      return `
        <div>
          ${labelBlock}
          <textarea data-field ${name} ${id} rows="${rows}" ${placeholder} ${required} class="${cls} resize-y">${def}</textarea>
        </div>`;
    }
    case 'number': {
      const def =
        f.defaultValue !== undefined ? `value="${f.defaultValue}"` : '';
      const min = f.min !== undefined ? `min="${f.min}"` : '';
      const max = f.max !== undefined ? `max="${f.max}"` : '';
      return `
        <div>
          ${labelBlock}
          <input data-field ${name} ${id} type="number" ${def} ${min} ${max} ${placeholder} ${required} class="${cls}" />
        </div>`;
    }
    case 'text':
    default: {
      const def = f.defaultValue
        ? `value="${escapeHtml(f.defaultValue)}"`
        : '';
      return `
        <div>
          ${labelBlock}
          <input data-field ${name} ${id} type="text" ${def} ${placeholder} ${required} class="${cls}" />
        </div>`;
    }
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
