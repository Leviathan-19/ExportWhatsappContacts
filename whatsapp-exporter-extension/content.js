(() => {
  'use strict';

  // Evita que el content script cree dos paneles si WhatsApp vuelve a renderizar la interfaz.
  if (window.__waContactExporterInstalled) return;
  window.__waContactExporterInstalled = true;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const normalize = (value) => String(value || '').replace(/\u200e/g, '').replace(/\s+/g, ' ').trim();
  const lower = (value) => normalize(value).toLocaleLowerCase();

  const LIMITS = {
    '3': 3,
    '10': 10,
    '50': 50,
    all: Infinity,
  };

  const state = {
    running: false,
    cancelled: false,
  };

  const DEBUG = true;
  const DEBUG_LOGS = [];

  function debugLog(message, data) {
    if (!DEBUG) return;
    const stamp = new Date().toISOString();
    const prefix = `[WA exporter ${stamp}] ${message}`;
    const serialized = data === undefined ? '' : ` ${safeJson(data)}`;
    DEBUG_LOGS.push(`${prefix}${serialized}`);
    if (DEBUG_LOGS.length > 1000) DEBUG_LOGS.shift();
    console.log(prefix, data === undefined ? '' : data);
  }

  function safeJson(value) {
    try {
      return JSON.stringify(value, (_key, item) => {
        if (typeof item === 'string' && item.length > 500) return `${item.slice(0, 500)}…`;
        return item;
      });
    } catch (_) {
      return String(value);
    }
  }

  function describeElement(element) {
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return {
      tag: element.tagName,
      id: element.id || '',
      role: element.getAttribute('role') || '',
      testid: element.getAttribute('data-testid') || '',
      aria: element.getAttribute('aria-label') || '',
      title: element.getAttribute('title') || '',
      text: normalize(element.innerText || element.textContent || '').slice(0, 300),
      visible: isVisible(element),
      rect: {
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
    };
  }

  function captureDiagnostic(reason, extra = {}) {
    const headers = Array.from(document.querySelectorAll('header'))
      .filter(isVisible)
      .slice(0, 10)
      .map(describeElement);
    const dialogs = Array.from(document.querySelectorAll('[role="dialog"]'))
      .filter(isVisible)
      .slice(0, 10)
      .map(describeElement);
    const newChatInput = findVisibleElement([
      'input[placeholder*="Buscar nombre" i]',
      'input[placeholder*="Search name" i]',
    ]);

    debugLog(`DIAGNÓSTICO: ${reason}`, {
      ...extra,
      url: location.href,
      newChatVisible: Boolean(newChatInput),
      newChatInput: describeElement(newChatInput),
      main: describeElement(document.querySelector('#main')),
      headers,
      dialogs,
    });
  }

  function isVisible(element) {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
  }

  async function waitFor(predicate, timeout = 10000, interval = 150) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      if (state.cancelled) throw new Error('Proceso cancelado por el usuario.');
      try {
        const result = predicate();
        if (result) return result;
      } catch (_) {
        // El DOM de WhatsApp cambia constantemente; se reintenta en la siguiente vuelta.
      }
      await sleep(interval);
    }
    return null;
  }

  function setStatus(text, isError = false) {
    const status = document.querySelector('#wa-exporter-status');
    if (!status) return;
    status.textContent = text;
    status.style.color = isError ? '#ffb4ab' : '#d9fdd3';
  }

  function isPhoneLike(value) {
    const text = normalize(value);
    if (!text) return false;
    const digits = text.replace(/\D/g, '');
    if (digits.length < 8 || digits.length > 15) return false;
    return /^[+\d\s().-]+$/.test(text);
  }

  function isAlphabeticalSeparator(value) {
    const text = normalize(value);
    // En el drawer de Nuevo chat, WhatsApp usa #, A, B, C, etc. como
    // encabezados de clasificación. No son filas de contactos.
    return /^(?:#|\p{L})$/u.test(text);
  }

  function isIgnoredLabel(value) {
    const text = lower(value);
    if (!text || isAlphabeticalSeparator(value)) return true;
    return [
      'nuevo grupo',
      'nuevo contacto',
      'nueva comunidad',
      'new group',
      'new contact',
      'new community',
      'descubre canales',
      'estados',
      'canales',
    ].some((ignored) => text === ignored || text.startsWith(`${ignored} `));
  }

  function findVisibleElement(selectors, root = document) {
    for (const selector of selectors) {
      for (const element of root.querySelectorAll(selector)) {
        if (isVisible(element)) return element;
      }
    }
    return null;
  }

  function findNewChatButton() {
    return findVisibleElement([
      'button[aria-label*="Nuevo chat" i]',
      '[role="button"][aria-label*="Nuevo chat" i]',
      '[title*="Nuevo chat" i]',
      'button[aria-label*="New chat" i]',
      '[role="button"][aria-label*="New chat" i]',
      '[title*="New chat" i]',
      '[data-testid="new-chat"]',
      '[data-testid="new-chat-menu"]',
    ]);
  }

  function findNewChatContainer() {
    const directDrawer = findVisibleElement(['[data-testid="new-chat-drawer"]']);
    if (directDrawer) return directDrawer;

    const input = findVisibleElement([
      'input[placeholder*="Buscar nombre" i]',
      'input[placeholder*="Search name" i]',
    ]);
    if (!input) return null;

    let node = input;
    for (let level = 0; level < 14 && node; level += 1, node = node.parentElement) {
      const text = lower(node.innerText);
      if (text.includes('nuevo grupo') && text.includes('nuevo contacto') && text.includes('nueva comunidad')) {
        return node;
      }
      if (text.includes('new group') && text.includes('new contact') && text.includes('new community')) {
        return node;
      }
    }

    return input.closest('[role="dialog"]') || input.parentElement;
  }

  async function openNewChat() {
    debugLog('openNewChat: iniciando', {
      existingContainer: Boolean(findNewChatContainer()),
      button: describeElement(findNewChatButton()),
    });

    let container = findNewChatContainer();
    if (container) {
      debugLog('openNewChat: la ventana ya estaba abierta', describeElement(container));
      return container;
    }

    const button = findNewChatButton();
    if (button) {
      debugLog('openNewChat: haciendo clic en el botón de Nuevo chat', describeElement(button));
      clickLikeUser(button);
    } else {
      // Fallback: algunos diseños no exponen aria-label, pero conservan este atajo.
      debugLog('openNewChat: no encontré botón; enviando Ctrl+Alt+N');
      document.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'n',
        code: 'KeyN',
        ctrlKey: true,
        altKey: true,
        bubbles: true,
        cancelable: true,
      }));
    }

    container = await waitFor(findNewChatContainer, 8000);
    if (!container) {
      captureDiagnostic('No se abrió Nuevo chat');
      throw new Error('No se pudo abrir “Nuevo chat”. Usa WhatsApp Web en la vista principal e inténtalo otra vez.');
    }
    debugLog('openNewChat: ventana abierta', describeElement(container));
    return container;
  }

  function findScrollableElement(root) {
    const elements = [root, ...root.querySelectorAll('*')].filter(isVisible);
    let best = root;
    let bestScrollableHeight = 0;

    for (const element of elements) {
      const scrollableHeight = element.scrollHeight - element.clientHeight;
      if (scrollableHeight > bestScrollableHeight + 20) {
        best = element;
        bestScrollableHeight = scrollableHeight;
      }
    }
    return best;
  }

  function getCandidateRows(root) {
    let rows = Array.from(root.querySelectorAll(
      '[role="listitem"], [role="row"], [data-testid="cell-frame-container"], [data-testid*="contact-list-item"]'
    ));

    if (!rows.length) {
      const titleNodes = Array.from(root.querySelectorAll('span[title], [data-testid="cell-frame-title"]'));
      rows = titleNodes
        .map((node) => node.closest('[role="listitem"], [role="row"], [data-testid="cell-frame-container"]') || node.parentElement?.parentElement)
        .filter(Boolean);
    }

    const result = [...new Set(rows)].filter(isVisible);
    debugLog('getCandidateRows: filas detectadas', {
      total: result.length,
      muestras: result.slice(0, 12).map((row) => getRowLabel(row)),
    });
    return result;
  }

  function getRowLabel(row) {
    const preferred = row.querySelector(
      '[data-testid="cell-frame-title"], span[title], [aria-label][dir="auto"], [dir="auto"]'
    );

    if (preferred) {
      const title = normalize(preferred.getAttribute('title'));
      const text = normalize(preferred.textContent);
      if (title) return title;
      if (text) return text;
    }

    const lines = String(row.innerText || '')
      .split('\n')
      .map(normalize)
      .filter(Boolean);
    return lines[0] || '';
  }

  function getRowCandidates(root) {
    const allRows = getCandidateRows(root)
      .map((row) => ({ row, label: getRowLabel(row) }));

    const separators = allRows.filter(({ label }) => isAlphabeticalSeparator(label));
    if (separators.length) {
      debugLog('getRowCandidates: separadores descartados', separators.map(({ label, row }) => ({
        label,
        row: describeElement(row),
      })));
    }

    const result = allRows.filter(({ label }) => label && !isIgnoredLabel(label));
    debugLog('getRowCandidates: contactos utilizables', {
      total: result.length,
      muestras: result.slice(0, 12).map(({ label }) => label),
    });
    return result;
  }

  function clickLikeUser(element) {
    if (!element) return null;

    const rect = element.getBoundingClientRect();
    const centerX = Math.round(rect.left + rect.width / 2);
    const centerY = Math.round(rect.top + rect.height / 2);
    const pointTarget = document.elementFromPoint(centerX, centerY);
    const target = pointTarget && (pointTarget === element || element.contains(pointTarget))
      ? pointTarget
      : element;

    debugLog('clickLikeUser: objetivo efectivo', {
      requested: describeElement(element),
      target: describeElement(target),
      point: { x: centerX, y: centerY },
    });

    if (typeof PointerEvent === 'function') {
      target.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: centerX,
        clientY: centerY,
        button: 0,
        buttons: 1,
        pointerId: 1,
        pointerType: 'mouse',
        isPrimary: true,
      }));
    }
    target.dispatchEvent(new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: centerX,
      clientY: centerY,
      button: 0,
      buttons: 1,
    }));
    if (typeof PointerEvent === 'function') {
      target.dispatchEvent(new PointerEvent('pointerup', {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: centerX,
        clientY: centerY,
        button: 0,
        buttons: 0,
        pointerId: 1,
        pointerType: 'mouse',
        isPrimary: true,
      }));
    }
    target.dispatchEvent(new MouseEvent('mouseup', {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: centerX,
      clientY: centerY,
      button: 0,
      buttons: 0,
    }));
    target.click();
    return target;
  }

  function findContactClickTarget(row) {
    const preferred = [
      '[data-testid="cell-frame-title"]',
      'span[title]',
      '[dir="auto"]',
      'div[tabindex="-1"]',
      '[role="button"]',
    ];

    for (const selector of preferred) {
      const candidate = Array.from(row.querySelectorAll(selector)).find((element) => isVisible(element));
      if (candidate) return candidate;
    }

    const rect = row.getBoundingClientRect();
    const pointTarget = document.elementFromPoint(
      Math.round(rect.left + rect.width / 2),
      Math.round(rect.top + rect.height / 2)
    );
    if (pointTarget && (pointTarget === row || row.contains(pointTarget))) return pointTarget;
    return row;
  }

  function findConversationHeader() {
    return document.querySelector('#main header') || findVisibleElement([
      '[data-testid="conversation-header"]',
      'header',
    ]);
  }

  async function openConversationFromRow(row) {
    debugLog('openConversationFromRow: antes del clic', {
      row: describeElement(row),
      rowText: normalize(row.innerText),
    });

    row.scrollIntoView({ block: 'center' });
    await sleep(180);

    // En esta interfaz el evento suele estar en un elemento interno de la fila.
    // Se evita pulsar un botón secundario y se prioriza el título/número visible.
    const clickable = findContactClickTarget(row);
    debugLog('openConversationFromRow: elemento que recibirá el clic', describeElement(clickable));
    clickLikeUser(clickable);

    // El primer contacto puede ser el chat que ya estaba abierto. Por eso no
    // exigimos que cambie el texto del encabezado: basta con confirmar que la
    // ventana de Nuevo chat desapareció y que existe un encabezado visible.
    const header = await waitFor(() => {
      if (findNewChatContainer()) return null;
      const currentHeader = findConversationHeader();
      return currentHeader && isVisible(currentHeader) && normalize(currentHeader.innerText)
        ? currentHeader
        : null;
    }, 10000);

    if (!header) {
      captureDiagnostic('El clic no produjo un encabezado de chat', {
        clicked: describeElement(clickable),
        row: describeElement(row),
      });
      return null;
    }

    debugLog('openConversationFromRow: chat abierto', describeElement(header));
    return header;
  }

  function findInfoDrawer() {
    const heading = Array.from(document.querySelectorAll('h1,h2,h3,header,div,span'))
      .filter(isVisible)
      .find((element) => /^(info\.? del contacto|contact info)$/i.test(normalize(element.textContent)));

    if (heading) {
      let node = heading;
      for (let level = 0; level < 12 && node; level += 1, node = node.parentElement) {
        const rect = node.getBoundingClientRect();
        const text = normalize(node.innerText);
        if (rect.width >= 250 && rect.right > window.innerWidth * 0.5 && text.length > 40) {
          return node;
        }
      }
    }

    // Fallback para versiones que no incluyen el título textual esperado.
    return findVisibleElement([
      '[data-testid="contact-info-drawer"]',
      '[data-testid="drawer-right"]',
      '[role="dialog"]',
    ]);
  }

  async function openInfoDrawer(header, expectedLabel) {
    const previousDrawer = findInfoDrawer();
    const previousText = normalize(previousDrawer?.innerText);
    const titleNode = header.querySelector('[dir="auto"], [title], span') || header;

    debugLog('openInfoDrawer: antes del clic en el encabezado', {
      header: describeElement(header),
      titleNode: describeElement(titleNode),
      expectedLabel,
      previousDrawer: describeElement(previousDrawer),
    });
    clickLikeUser(titleNode);

    const drawer = await waitFor(() => {
      const currentDrawer = findInfoDrawer();
      if (!currentDrawer) return null;

      const text = normalize(currentDrawer.innerText);
      const expected = lower(expectedLabel);
      const containsExpected = expected && lower(text).includes(expected);
      const isFreshDrawer = currentDrawer !== previousDrawer || text !== previousText;

      // Evita leer inmediatamente el teléfono del panel del contacto anterior.
      // WhatsApp puede reutilizar el mismo nodo DOM y solo cambiar su contenido.
      if (isFreshDrawer && (containsExpected || isPhoneLike(expectedLabel) || !previousDrawer)) return currentDrawer;
      return null;
    }, 10000);

    if (!drawer) {
      captureDiagnostic('El encabezado no abrió un panel lateral nuevo', {
        expectedLabel,
        header: describeElement(header),
        titleNode: describeElement(titleNode),
        previousDrawer: describeElement(previousDrawer),
      });
      return null;
    }

    debugLog('openInfoDrawer: panel lateral abierto', describeElement(drawer));
    return drawer;
  }

  function extractPhoneFromText(text) {
    const matches = String(text || '').match(/(?<!\d)(\+?\d[\d\s().-]{7,}\d)(?!\d)/g) || [];
    const candidates = matches
      .map((raw) => normalize(raw))
      .filter((raw) => {
        const digits = raw.replace(/\D/g, '');
        if (digits.length < 8 || digits.length > 15) return false;
        if (/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(raw)) return false;
        return true;
      })
      .sort((a, b) => Number(b.includes('+')) - Number(a.includes('+')) || b.replace(/\D/g, '').length - a.replace(/\D/g, '').length);

    return candidates[0] || '';
  }

  function extractContactData(drawer, rowLabel) {
    let phone = '';

    const telLink = drawer?.querySelector('a[href^="tel:"]');
    if (telLink) phone = normalize(telLink.getAttribute('href').replace(/^tel:/i, ''));

    if (!phone && drawer) {
      const lines = String(drawer.innerText || '')
        .split('\n')
        .map(normalize)
        .filter(Boolean);
      for (const line of lines) {
        const candidate = extractPhoneFromText(line);
        if (candidate) {
          phone = candidate;
          break;
        }
      }
    }

    if (!phone && isPhoneLike(rowLabel)) phone = normalize(rowLabel);

    const name = rowLabel && !isPhoneLike(rowLabel) && !isIgnoredLabel(rowLabel)
      ? rowLabel
      : 'Sin registrar';

    return {
      name,
      phone: phone || 'No encontrado',
    };
  }

  function findCloseButton(scope = document) {
    return findVisibleElement([
      '[data-testid="drawer-close"]',
      'button[aria-label*="Cerrar" i]',
      '[role="button"][aria-label*="Cerrar" i]',
      'button[aria-label*="Close" i]',
      '[role="button"][aria-label*="Close" i]',
      '[data-icon="x"]',
    ], scope);
  }

  async function closeInfoDrawer() {
    const drawer = findInfoDrawer();
    if (!drawer) return;

    debugLog('closeInfoDrawer: cerrando panel lateral', describeElement(drawer));
    const closeButton = findCloseButton(drawer) || findCloseButton();
    if (closeButton) {
      clickLikeUser(closeButton.closest('[role="button"],button') || closeButton);
    } else {
      document.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Escape',
        code: 'Escape',
        bubbles: true,
        cancelable: true,
      }));
    }

    // No se continúa hasta confirmar que el panel anterior desapareció.
    let closed = await waitFor(() => !findInfoDrawer(), 3000, 120);
    if (!closed) {
      document.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Escape',
        code: 'Escape',
        bubbles: true,
        cancelable: true,
      }));
      closed = await waitFor(() => !findInfoDrawer(), 3000, 120);
    }

    if (!closed) {
      captureDiagnostic('El panel lateral no se pudo cerrar', { drawer: describeElement(drawer) });
      throw new Error('No se pudo cerrar la información del contacto anterior.');
    }
    debugLog('closeInfoDrawer: panel cerrado correctamente');
  }

  function csvEscape(value) {
    return `"${String(value ?? '').replace(/"/g, '""')}"`;
  }

  function downloadCsv(records) {
    const csv = '\uFEFFNombre,Teléfono\n' + records
      .map((record) => `${csvEscape(record.name)},${csvEscape(record.phone)}`)
      .join('\n') + '\n';

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `contactos_whatsapp_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function extractContacts(limit) {
    const records = [];
    const processed = new Set();
    let scrollTop = 0;
    let bottomPasses = 0;

    while (records.length < limit) {
      debugLog('extractContacts: inicio de iteración', {
        records: records.length,
        limit: limit === Infinity ? 'all' : limit,
        processed: Array.from(processed),
        scrollTop,
      });

      // Cada vuelta empieza sin panel lateral residual y vuelve a abrir Nuevo chat.
      await closeInfoDrawer();
      const root = await openNewChat();
      const scroller = findScrollableElement(root);
      scroller.scrollTop = scrollTop;
      await sleep(500);

      debugLog('extractContacts: estado de la lista', {
        root: describeElement(root),
        scroller: describeElement(scroller),
        scrollTop: scroller.scrollTop,
        clientHeight: scroller.clientHeight,
        scrollHeight: scroller.scrollHeight,
      });

      const candidates = getRowCandidates(root);
      const next = candidates.find(({ label }) => !processed.has(lower(label)));

      if (!next) {
        const previousTop = scroller.scrollTop;
        scroller.scrollBy(0, Math.max(250, scroller.clientHeight * 0.75));
        await sleep(700);
        scrollTop = scroller.scrollTop;

        const atBottom = scrollTop <= previousTop + 2 || scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4;
        bottomPasses = atBottom ? bottomPasses + 1 : 0;
        if (bottomPasses >= 2) break;
        continue;
      }

      const labelKey = lower(next.label);
      processed.add(labelKey);
      const currentScrollTop = scroller.scrollTop;
      scrollTop = currentScrollTop;

      debugLog('extractContacts: contacto seleccionado', {
        index: records.length + 1,
        label: next.label,
        row: describeElement(next.row),
      });

      setStatus(`Procesando ${records.length + 1}${limit === Infinity ? '' : ` de ${limit}`}…`);
      const header = await openConversationFromRow(next.row);
      if (!header) throw new Error(`No se pudo abrir el chat de “${next.label}”.`);

      const drawer = await openInfoDrawer(header, next.label);
      if (!drawer) throw new Error(`No se pudo abrir la información de “${next.label}”.`);

      const data = extractContactData(drawer, next.label);
      debugLog('extractContacts: datos extraídos', data);
      records.push(data);
      setStatus(`${records.length} contacto(s) preparado(s).`);
      await closeInfoDrawer();
      await sleep(300);
    }

    debugLog('extractContacts: proceso finalizado', { total: records.length, records });
    downloadCsv(records);
    return records;
  }

  async function copyDebugLogs() {
    const text = DEBUG_LOGS.join('\\n');
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        setStatus('Logs copiados al portapapeles.');
        return;
      }
    } catch (error) {
      debugLog('copyDebugLogs: el portapapeles no está disponible', String(error));
    }

    const blob = new Blob([text], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `wa-exporter-debug-${new Date().toISOString().replace(/[:.]/g, '-')}.log`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus('No se pudo copiar; se descargó un archivo de logs.');
  }

  async function runExtractionFromPanel(startButton, stopButton, select) {
    if (state.running) return;

    state.running = true;
    state.cancelled = false;
    startButton.disabled = true;
    select.disabled = true;
    startButton.style.opacity = '0.6';
    stopButton.style.display = 'block';

    try {
      const selectedValue = select.value;
      const limit = Object.prototype.hasOwnProperty.call(LIMITS, selectedValue)
        ? LIMITS[selectedValue]
        : 10;
      const records = await extractContacts(limit);
      setStatus(`Listo: ${records.length} contacto(s) exportado(s).`);
      alert(`Se exportaron ${records.length} contacto(s) a un archivo CSV.`);
    } catch (error) {
      console.error('[WA exporter]', error);
      const errorMessage = error && error.message ? error.message : 'Error desconocido.';
      setStatus(errorMessage, true);
      if (!state.cancelled) {
        alert(`No se pudo completar la extracción: ${errorMessage}`);
      }
    } finally {
      state.running = false;
      state.cancelled = false;
      startButton.disabled = false;
      select.disabled = false;
      startButton.style.opacity = '1';
      stopButton.style.display = 'none';
    }
  }

  function addExporterPanel() {
    if (document.getElementById('wa-exporter-panel')) return;

    const panel = document.createElement('section');
    panel.id = 'wa-exporter-panel';
    Object.assign(panel.style, {
      position: 'fixed',
      left: '64px',
      bottom: '20px',
      width: '250px',
      padding: '12px',
      background: '#202c33',
      color: '#e9edef',
      border: '1px solid #3b4a54',
      borderRadius: '10px',
      boxShadow: '0 6px 24px rgba(0,0,0,.45)',
      zIndex: '2147483647',
      fontFamily: 'Arial, sans-serif',
      fontSize: '13px',
    });

    panel.innerHTML = `
      <div style="font-weight:700;margin-bottom:9px">Exportar contactos</div>
      <label style="display:block;margin-bottom:5px" for="wa-exporter-limit">Límite de contactos</label>
      <select id="wa-exporter-limit" style="width:100%;box-sizing:border-box;padding:7px;border:1px solid #667781;border-radius:6px;background:#111b21;color:#e9edef;margin-bottom:9px">
        <option value="3">3</option>
        <option value="10" selected>10</option>
        <option value="50">50</option>
        <option value="all">Todos</option>
      </select>
      <div style="display:flex;gap:7px">
        <button id="wa-exporter-start" type="button" style="flex:1;padding:8px;border:0;border-radius:6px;background:#00a884;color:white;font-weight:700;cursor:pointer">Exportar CSV</button>
        <button id="wa-exporter-stop" type="button" style="display:none;padding:8px;border:0;border-radius:6px;background:#667781;color:white;cursor:pointer">Detener</button>
      </div>
      <div id="wa-exporter-status" style="margin-top:8px;line-height:1.3;color:#d9fdd3">Listo.</div>
      <button id="wa-exporter-copy-logs" type="button" style="width:100%;margin-top:8px;padding:6px;border:1px solid #667781;border-radius:6px;background:transparent;color:#d9edef;cursor:pointer">Copiar logs de depuración</button>
    `;

    document.body.appendChild(panel);

    const startButton = panel.querySelector('#wa-exporter-start');
    const stopButton = panel.querySelector('#wa-exporter-stop');
    const select = panel.querySelector('#wa-exporter-limit');
    const copyLogsButton = panel.querySelector('#wa-exporter-copy-logs');

    stopButton.addEventListener('click', () => {
      state.cancelled = true;
      debugLog('Interrupción solicitada por el usuario');
      setStatus('Cancelando…');
    });

    copyLogsButton.addEventListener('click', function () {
      copyDebugLogs();
    });

    startButton.addEventListener('click', function () {
      debugLog('Botón Exportar CSV pulsado', { selectedLimit: select.value });
      runExtractionFromPanel(startButton, stopButton, select);
    });
  }

  const init = setInterval(() => {
    if (document.body) {
      clearInterval(init);
      addExporterPanel();
    }
  }, 1000);
})();

/*
  Nota: WhatsApp Web cambia sus selectores internos con frecuencia. Si una futura
  actualización cambia los atributos aria-label/data-testid, basta con ajustar
  findNewChatButton(), getCandidateRows() o findInfoDrawer().
*/
  
