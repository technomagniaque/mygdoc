/**
 * Générateurs de scripts DOM exécutés dans les WebContentsView de MyGDoc.
 * Reproduit le contrat DOM/Accessibilité de l'extension Gemini Antigravity in Chrome
 * tout en masquant les champs sensibles (mots de passe).
 */

export function buildReadPageScript(params: {
  maxElements?: number;
  maxTextLength?: number;
}): string {
  const maxElements = Math.min(Math.max(Number(params.maxElements || 150), 1), 400);
  const maxTextLength = Math.min(Math.max(Number(params.maxTextLength || 120), 20), 500);

  return `(() => {
    const MAX_ELEMENTS = ${maxElements};
    const MAX_TEXT = ${maxTextLength};
    const selectors = [
      'a[href]',
      'button',
      'input',
      'textarea',
      'select',
      '[role="button"]',
      '[role="link"]',
      '[role="textbox"]',
      '[role="menuitem"]',
      '[role="tab"]',
      '[contenteditable="true"]'
    ].join(',');

    const isVisible = (el) => {
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
        return false;
      }
      const rect = el.getBoundingClientRect();
      return rect.width > 1 && rect.height > 1;
    };

    const getName = (el) => {
      const label =
        el.getAttribute('aria-label') ||
        el.getAttribute('title') ||
        el.getAttribute('placeholder') ||
        el.innerText ||
        el.textContent ||
        '';
      return label.replace(/\\s+/g, ' ').trim().slice(0, MAX_TEXT);
    };

    const candidates = Array.from(document.querySelectorAll(selectors));
    const elements = [];
    let counter = 0;

    for (const el of candidates) {
      if (elements.length >= MAX_ELEMENTS) break;
      if (!isVisible(el)) continue;

      counter += 1;
      const ref = 'ref_' + counter;
      el.setAttribute('data-agy-ref', ref);

      const tag = el.tagName.toLowerCase();
      const inputType = tag === 'input' ? (el.getAttribute('type') || 'text').toLowerCase() : undefined;
      const isPassword = inputType === 'password';
      const rect = el.getBoundingClientRect();

      let value;
      if ('value' in el && typeof el.value === 'string') {
        value = isPassword ? '[REDACTED]' : el.value.slice(0, MAX_TEXT);
      }

      elements.push({
        ref,
        tag,
        role: el.getAttribute('role') || undefined,
        type: inputType,
        name: getName(el),
        value,
        href: tag === 'a' ? el.getAttribute('href') || undefined : undefined,
        rect: {
          x: Math.round(rect.left + rect.width / 2),
          y: Math.round(rect.top + rect.height / 2),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
      });
    }

    return {
      title: document.title,
      url: location.href,
      elementCount: elements.length,
      elements,
      textPreview: (document.body?.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 1500),
    };
  })()`;
}

const ELEMENT_RESOLVER_SNIPPET = `
  const findTarget = (p) => {
    if (p.ref) {
      const byRef = document.querySelector('[data-agy-ref="' + CSS.escape(String(p.ref)) + '"]');
      if (byRef) return byRef;
    }
    if (p.selector) {
      const bySel = document.querySelector(String(p.selector));
      if (bySel) return bySel;
    }
    if (p.text) {
      const needle = String(p.text).trim().toLowerCase();
      const candidates = Array.from(document.querySelectorAll('a,button,[role="button"],[role="menuitem"],label,span'));
      return candidates.find((el) => (el.innerText || el.textContent || '').trim().toLowerCase().includes(needle)) || null;
    }
    if (typeof p.x === 'number' && typeof p.y === 'number') {
      return document.elementFromPoint(p.x, p.y);
    }
    return null;
  };

  const setControlledValue = (el, value) => {
    const inputType = (el.getAttribute('type') || '').toLowerCase();
    if (inputType === 'password') {
      throw new Error('Saisie automatique bloquée sur un champ mot de passe.');
    }
    const proto = el.tagName === 'TEXTAREA'
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
    if (descriptor && descriptor.set) {
      descriptor.set.call(el, value);
    } else if ('value' in el) {
      el.value = value;
    } else if (el.isContentEditable) {
      el.textContent = value;
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
`;

export function buildClickScript(params: Record<string, unknown>): string {
  const payload = JSON.stringify(params);
  return `(() => {
    const p = ${payload};
    ${ELEMENT_RESOLVER_SNIPPET}
    const el = findTarget(p);
    if (!el) throw new Error('Élément cible introuvable dans la page.');
    el.scrollIntoView({ block: 'center', inline: 'center' });
    const rect = el.getBoundingClientRect();
    const coordinates = {
      x: Math.round(rect.left + rect.width / 2),
      y: Math.round(rect.top + rect.height / 2),
    };
    if (p.doubleClick) {
      el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, clientX: coordinates.x, clientY: coordinates.y }));
    } else if (typeof el.click === 'function') {
      el.click();
    } else {
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: coordinates.x, clientY: coordinates.y }));
    }
    return {
      clicked: true,
      name: (el.getAttribute('aria-label') || el.innerText || el.tagName || '').trim().slice(0, 120),
      coordinates,
    };
  })()`;
}

export function buildHoverScript(params: Record<string, unknown>): string {
  const payload = JSON.stringify(params);
  return `(() => {
    const p = ${payload};
    ${ELEMENT_RESOLVER_SNIPPET}
    const el = findTarget(p);
    if (!el) throw new Error('Élément cible introuvable pour hover.');
    el.scrollIntoView({ block: 'center', inline: 'center' });
    const rect = el.getBoundingClientRect();
    const x = Math.round(rect.left + rect.width / 2);
    const y = Math.round(rect.top + rect.height / 2);
    el.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, clientX: x, clientY: y }));
    el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, clientX: x, clientY: y }));
    return { hovered: true, coordinates: { x, y }, name: (el.innerText || el.tagName || '').trim().slice(0, 80) };
  })()`;
}

export function buildHighlightScript(params: Record<string, unknown>): string {
  const payload = JSON.stringify(params);
  return `(() => {
    const p = ${payload};
    ${ELEMENT_RESOLVER_SNIPPET}
    const existing = document.getElementById('__mygdoc_highlight_box');
    if (existing) existing.remove();
    if (p.clear) return { cleared: true };
    const el = findTarget(p);
    if (!el) throw new Error('Élément cible introuvable pour highlight.');
    el.scrollIntoView({ block: 'center', inline: 'center' });
    const rect = el.getBoundingClientRect();
    const box = document.createElement('div');
    box.id = '__mygdoc_highlight_box';
    box.style.position = 'fixed';
    box.style.left = rect.left + 'px';
    box.style.top = rect.top + 'px';
    box.style.width = rect.width + 'px';
    box.style.height = rect.height + 'px';
    box.style.border = '2px solid #4f8cff';
    box.style.background = 'rgba(79, 140, 255, 0.14)';
    box.style.borderRadius = '4px';
    box.style.pointerEvents = 'none';
    box.style.zIndex = '2147483647';
    document.body.appendChild(box);
    const ms = Math.min(Math.max(Number(p.durationMs || 2500), 200), 15000);
    setTimeout(() => box.remove(), ms);
    return { highlighted: true, name: (el.innerText || el.tagName || '').trim().slice(0, 80) };
  })()`;
}

export function buildTypeScript(params: Record<string, unknown>): string {
  const payload = JSON.stringify(params);
  return `(() => {
    const p = ${payload};
    ${ELEMENT_RESOLVER_SNIPPET}
    const el = findTarget(p) || document.activeElement;
    if (!el) throw new Error('Aucun champ éditable trouvé.');
    el.focus();
    const text = String(p.text ?? '');
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable) {
      const nextVal = p.clearFirst ? text : (el.value || '') + text;
      setControlledValue(el, nextVal);
    }
    if (p.pressEnter) {
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
      el.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', code: 'Enter', bubbles: true }));
    }
    return { typed: true, name: (el.getAttribute?.('aria-label') || el.tagName || '').trim().slice(0, 80) };
  })()`;
}

export function buildFillFormScript(fields: Array<Record<string, unknown>>): string {
  const payload = JSON.stringify(fields);
  return `(() => {
    const fields = ${payload};
    ${ELEMENT_RESOLVER_SNIPPET}
    let filledCount = 0;
    for (const field of fields) {
      const el = findTarget(field);
      if (!el) continue;
      el.focus();
      if (el.tagName === 'SELECT') {
        el.value = String(field.value ?? '');
        el.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        setControlledValue(el, String(field.value ?? ''));
      }
      filledCount += 1;
    }
    return { filledCount };
  })()`;
}

export function buildScrollScript(params: Record<string, unknown>): string {
  const payload = JSON.stringify(params);
  return `(() => {
    const p = ${payload};
    ${ELEMENT_RESOLVER_SNIPPET}
    const amount = Number(p.amount || 500);
    const dir = String(p.direction || 'down');
    const el = (p.ref || p.selector) ? findTarget(p) : null;
    if (el && (p.ref || p.selector) && !p.direction) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return { scrolled: true, target: p.ref || p.selector };
    }
    const target = el || window;
    const dx = dir === 'left' ? -amount : dir === 'right' ? amount : 0;
    const dy = dir === 'up' ? -amount : dir === 'down' ? amount : 0;
    target.scrollBy({ left: dx, top: dy, behavior: 'smooth' });
    return { scrolled: true, direction: dir, amount };
  })()`;
}

export function buildWaitForScript(params: Record<string, unknown>): string {
  const payload = JSON.stringify(params);
  return `(() => {
    const p = ${payload};
    const timeoutMs = Math.min(Math.max(Number(p.timeoutMs || 10000), 100), 30000);
    const selector = p.selector ? String(p.selector) : null;
    const text = p.text ? String(p.text) : null;

    const matches = () => {
      if (selector && !document.querySelector(selector)) return false;
      if (text && !(document.body?.innerText || '').includes(text)) return false;
      return Boolean(selector || text);
    };

    if (matches()) return Promise.resolve({ found: true });

    return new Promise((resolve, reject) => {
      const start = Date.now();
      const timer = setInterval(() => {
        if (matches()) {
          clearInterval(timer);
          resolve({ found: true, elapsedMs: Date.now() - start });
          return;
        }
        if (Date.now() - start >= timeoutMs) {
          clearInterval(timer);
          reject(new Error('Délai dépassé (wait_for) avant apparition de la condition.'));
        }
      }, 150);
    });
  })()`;
}

export function buildNetworkPerfScript(limit = 50): string {
  const safeLimit = Math.min(Math.max(Number(limit || 50), 1), 200);
  return `(() => {
    const entries = performance.getEntriesByType('resource').slice(-${safeLimit});
    return entries.map((e) => ({
      name: e.name,
      initiatorType: e.initiatorType,
      durationMs: Math.round(e.duration),
      transferSize: e.transferSize || 0,
    }));
  })()`;
}
