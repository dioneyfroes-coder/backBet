(function () {
  const API_BASE = '/api/v1';
  const SESSION_KEY = 'backbet_session';

  const state = {
    token: null,
    user: null,
    selectedBet: null,
  };

  const storage = {
    load() {
      try {
        return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
      } catch (_e) {
        return null;
      }
    },
    save() {
      localStorage.setItem(
        SESSION_KEY,
        JSON.stringify({ token: state.token, user: state.user }),
      );
    },
    clear() {
      localStorage.removeItem(SESSION_KEY);
    },
  };

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const esc = (value) =>
    String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const formatMoney = (value, currency = 'BRL') =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(Number(value || 0));

  const formatDate = (value) => {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return esc(value);
    return date.toLocaleString('pt-BR');
  };

  async function api(path, { method = 'GET', body } = {}) {
    const headers = {};
    if (state.token) {
      headers.Authorization = `Bearer ${state.token}`;
    }
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    let payload = null;
    try {
      payload = await response.json();
    } catch (_e) {
      payload = null;
    }

    if (!response.ok) {
      const err = new Error(
        payload?.error?.message ||
          (payload?.error?.details
            ? Object.entries(payload.error.details)
                .map(([k, v]) => `${k}: ${v}`)
                .join('; ')
            : `Erro ${response.status}`) ||
          `Erro ${response.status}`,
      );
      err.status = response.status;
      err.code = payload?.error?.code;
      throw err;
    }

    return payload ? payload.data ?? payload : null;
  }

  function showMessage(text, type = '') {
    const el = $('#app-view').classList.contains('hidden')
      ? $('#auth-message')
      : $('#app-message');
    el.textContent = text || '';
    el.className = 'message' + (type ? ` ${type}` : '');
  }

  function showAuthView() {
    $('#auth-view').classList.remove('hidden');
    $('#app-view').classList.add('hidden');
  }

  function showAppView() {
    $('#auth-view').classList.add('hidden');
    $('#app-view').classList.remove('hidden');
  }

  function enterApp({ token, user }) {
    state.token = token;
    state.user = user;
    storage.save();
    $('#user-name').textContent = user
      ? `${user.firstName || user.username || user.email} ${user.lastName || ''}`.trim()
      : '—';
    showAppView();
    switchTab('saldo');
    refreshBalance();
    loadProfile();
  }

  async function forceLogout(message = 'Sessão expirada. Faça login novamente.') {
    state.token = null;
    state.user = null;
    state.selectedBet = null;
    storage.clear();
    showAuthView();
    $('#login-form').reset();
    showMessage(message, 'error');
  }

  /* ---------------- Auth ---------------- */
  async function handleLogin(event) {
    event.preventDefault();
    showMessage('Entrando…');
    const form = event.target;
    const data = new FormData(form);
    try {
      const result = await api('/auth/login', {
        method: 'POST',
        body: {
          email: data.get('email'),
          password: data.get('password'),
        },
      });
      enterApp({ token: result.accessToken, user: result.user });
      showMessage('Login realizado com sucesso', 'success');
    } catch (error) {
      showMessage(error.message, 'error');
    }
  }

  async function handleRegister(event) {
    event.preventDefault();
    showMessage('Criando conta…');
    const form = event.target;
    const data = new FormData(form);
    try {
      const result = await api('/auth/register', {
        method: 'POST',
        body: {
          email: data.get('email'),
          username: data.get('username'),
          password: data.get('password'),
          firstName: data.get('firstName'),
          lastName: data.get('lastName'),
        },
      });
      if (result.accessToken) {
        enterApp({ token: result.accessToken, user: result.user });
        showMessage('Conta criada e login realizado com sucesso', 'success');
      } else {
        form.reset();
        showMessage(
          `Conta criada. Status: ${result.status}. Aguardando liberação para operar.`,
          'success',
        );
      }
    } catch (error) {
      showMessage(error.message, 'error');
    }
  }

  async function handleLogout() {
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch (_error) {
      // segue o logout mesmo se o servidor falhar
    }
    forceLogout('Você saiu da conta.');
  }

  /* ---------------- Saldo / wallet ---------------- */
  async function refreshBalance() {
    if (!state.token) return;
    try {
      const wallet = await api('/wallets/me');
      $('#balance-value').textContent = formatMoney(wallet.balance, wallet.currency);
    } catch (_error) {
      $('#balance-value').textContent = '—';
    }
  }

  async function loadWalletOverview() {
    const box = $('#wallet-overview');
    box.innerHTML = 'Carregando…';
    try {
      const wallet = await api('/wallets/me');
      box.innerHTML =
        `<p><strong>Saldo disponível:</strong> ${formatMoney(wallet.balance, wallet.currency)}</p>` +
        `<p><strong>Saldo bloqueado:</strong> ${formatMoney(
          wallet.lockedBalance,
          wallet.currency,
        )}</p>` +
        `<p><span class="badge">${esc(wallet.currency)}</span> Carteira ${esc(wallet.userId)}</p>`;
    } catch (error) {
      box.innerHTML =
        `<p class="empty">Não foi possível carregar a carteira: ${esc(error.message)}</p>`;
    }
  }

  /* ---------------- Depósito / Saque ---------------- */
  async function handleDeposit(event) {
    event.preventDefault();
    const amount = Number(event.target.amount.value);
    const resultBox = $('#deposit-result');
    resultBox.classList.remove('hidden');
    resultBox.innerHTML = '<p>Processando depósito…</p>';
    try {
      const result = await api('/wallets/deposit', {
        method: 'POST',
        body: { amount, currency: 'BRL' },
      });
      const pix = result.pix || {};
      let pixHtml = `<p class="pix-box">Referência: ${esc(pix.reference || '')}<br/>` +
        `Status: ${esc(pix.status || '')} · Provedor: ${esc(pix.provider || '')}<br/>` +
        `Charge ID: ${esc(pix.chargeId || '')}</p>`;
      if (pix.qrCode) {
        if (String(pix.qrCode).startsWith('data:image')) {
          pixHtml += `<img src="${esc(pix.qrCode)}" alt="QR Code Pix" style="max-width:180px" />`;
        } else {
          pixHtml += `<p class="pix-box">${esc(pix.qrCode)}</p>`;
        }
      }
      resultBox.innerHTML =
        `<p class="message success">${esc(result.message || 'Depósito realizado')}</p>` +
        pixHtml;
      event.target.reset();
      refreshBalance();
    } catch (error) {
      resultBox.innerHTML =
        `<p class="message error">${esc(error.message)}</p>`;
    }
  }

  async function handleWithdraw(event) {
    event.preventDefault();
    const amount = Number(event.target.amount.value);
    const pixKey = event.target.pixKey.value.trim();
    const resultBox = $('#withdraw-result');
    resultBox.classList.remove('hidden');
    resultBox.innerHTML = '<p>Processando saque…</p>';
    try {
      const body = { amount, currency: 'BRL' };
      if (pixKey) {
        body.pixKey = pixKey;
      }
      const result = await api('/wallets/withdraw', { method: 'POST', body });
      const pix = result.pix || {};
      resultBox.innerHTML =
        `<p class="message success">${esc(result.message || 'Saque realizado')}</p>` +
        `<p class="pix-box">Payout ID: ${esc(pix.payoutId || '')}<br/>` +
        `Referência: ${esc(pix.reference || '')}<br/>` +
        `Status: ${esc(pix.status || '')} · Provedor: ${esc(pix.provider || '')}</p>`;
      event.target.reset();
      refreshBalance();
    } catch (error) {
      resultBox.innerHTML =
        `<p class="message error">${esc(error.message)}</p>`;
    }
  }

  /* ---------------- Eventos / Apostas ---------------- */
  function marketOddLabel(market, oddKey) {
    const map = {
      'mkt-1x2': { home: 'Casa', draw: 'Empate', away: 'Fora' },
      'mkt-winner': { lakers: 'Data Lakers', warriors: 'AI Warriors' },
      'mkt-match': { ada: 'Ada Lovelace', grace: 'Grace Hopper' },
    };
    const labels = map[market.id] || {};
    return labels[oddKey] || oddKey;
  }

  async function loadEvents() {
    const list = $('#events-list');
    list.innerHTML = 'Carregando…';
    state.selectedBet = null;
    try {
      const data = await api('/events');
      const events = (data.events || []).filter((event) => /SCHEDULED|LIVE/.test(event.status));
      if (events.length === 0) {
        list.innerHTML = '<p class="empty">Nenhum evento disponível no momento.</p>';
        return;
      }
      list.innerHTML = '';
      events.forEach((event) => {
        list.appendChild(renderEvent(event));
      });
    } catch (error) {
      list.innerHTML = `<p class="empty">Não foi possível carregar eventos: ${esc(error.message)}</p>`;
    }
  }

  function renderEvent(event) {
    const card = document.createElement('div');
    card.className = 'event';
    card.dataset.eventId = event.id;

    const markets = Object.values(event.markets || {});

    const head = document.createElement('div');
    head.className = 'event-head';
    head.innerHTML =
      `<h3>${esc(event.name)}</h3>` +
      `<span class="badge">${esc(event.category)} · ${esc(event.status)}</span>`;
    card.appendChild(head);

    const schedule = document.createElement('div');
    schedule.className = 'schedule';
    schedule.textContent = `${Array.isArray(event.participants) ? event.participants.join(' vs ') : ''} · Início ${formatDate(event.startDate)}`;
    card.appendChild(schedule);

    markets.forEach((market) => {
      const block = document.createElement('div');
      block.className = 'market';
      block.innerHTML = `<h4>${esc(market.name)}</h4>`;

      const oddsRow = document.createElement('div');
      oddsRow.className = 'odds';
      Object.entries(market.odds || {}).forEach(([oddKey, oddValue]) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.innerHTML =
          `<span class="odd-label">${esc(marketOddLabel(market, oddKey))}</span>` +
          `<span class="odd-value">${Number(oddValue).toFixed(2)}</span>`;
        button.addEventListener('click', () => {
          selectOdd(event, market, oddKey, button, oddsRow);
        });
        oddsRow.appendChild(button);
      });
      block.appendChild(oddsRow);
      card.appendChild(block);
    });

    return card;
  }

  function selectOdd(event, market, oddKey, button, oddsRow) {
    $$('.odds button.selected').forEach((el) => el.classList.remove('selected'));
    $$('.bet-form').forEach((el) => el.remove());

    button.classList.add('selected');
    state.selectedBet = {
      eventId: event.id,
      marketId: market.id,
      oddId: oddKey,
      oddValue: market.odds[oddKey],
      oddLabel: marketOddLabel(market, oddKey),
      eventName: event.name,
    };

    const form = document.createElement('form');
    form.className = 'bet-form';
    form.innerHTML =
      `<label>Aposta (${esc(state.selectedBet.eventName)} · ${esc(state.selectedBet.oddLabel)} @ ${Number(state.selectedBet.oddValue).toFixed(2)})` +
      `<input type="number" name="amount" step="0.01" min="0.01" required placeholder="Valor em BRL" /></label>` +
      `<button type="submit" class="primary">Apostar</button>` +
      `<button type="button" class="ghost" data-cancel>Cancelar</button>`;

    form.querySelector('[data-cancel]').addEventListener('click', () => {
      button.classList.remove('selected');
      form.remove();
      state.selectedBet = null;
    });

    form.addEventListener('submit', (event) => handlePlaceBet(event, form));
    button.closest('.market').appendChild(form);
    form.querySelector('[name="amount"]').focus();
  }

  async function handlePlaceBet(event, form) {
    event.preventDefault();
    if (!state.selectedBet) return;
    const amount = Number(form.querySelector('[name="amount"]').value);

    const btn = form.querySelector('button[type="submit"]');
    const original = btn.textContent;
    btn.textContent = 'Apostando…';
    btn.disabled = true;

    try {
      const bet = await api('/bets', {
        method: 'POST',
        body: {
          eventId: state.selectedBet.eventId,
          marketId: state.selectedBet.marketId,
          oddId: state.selectedBet.oddId,
          amount,
          type: 'SINGLE',
          currency: 'BRL',
        },
      });
      showMessage(
        `Aposta criada! R$ ${bet.amount.toFixed(2)} @ ${bet.odds.toFixed(2)} → retorno potencial R$ ${bet.potentialReturn.toFixed(2)}`,
        'success',
      );
      form.remove();
      $$('.odds button.selected').forEach((el) => el.classList.remove('selected'));
      state.selectedBet = null;
      refreshBalance();
    } catch (error) {
      showMessage(error.message, 'error');
      btn.textContent = original;
      btn.disabled = false;
    }
  }

  /* ---------------- Histórico ---------------- */
  async function loadBets() {
    const box = $('#bets-list');
    box.innerHTML = 'Carregando…';
    try {
      const data = await api('/bets/me');
      const bets = data.bets || [];
      if (bets.length === 0) {
        box.innerHTML = '<p class="empty">Você ainda não fez apostas.</p>';
        return;
      }
      const rows = bets
        .map(
          (bet) =>
            `<tr>` +
            `<td>${formatDate(bet.createdAt)}</td>` +
            `<td>${esc(bet.eventId || '')}</td>` +
            `<td>${esc(bet.marketId || '')}</td>` +
            `<td>${formatMoney(bet.amount, 'BRL')}</td>` +
            `<td>${Number(bet.odds).toFixed(2)}</td>` +
            `<td>${formatMoney(bet.potentialReturn, 'BRL')}</td>` +
            `<td><span class="status-${esc(bet.status)}">${esc(bet.status)}</span></td>` +
            `</tr>`,
        )
        .join('');
      box.innerHTML =
        `<table><thead><tr>` +
        `<th>Data</th><th>Evento</th><th>Mercado</th><th>Valor</th><th>Odds</th><th>Retorno pot.</th><th>Status</th>` +
        `</tr></thead><tbody>${rows}</tbody></table>`;
    } catch (error) {
      box.innerHTML = `<p class="empty">${esc(error.message)}</p>`;
    }
  }

  async function loadLedger() {
    const box = $('#ledger-list');
    box.innerHTML = 'Carregando…';
    try {
      const data = await api('/wallets/history?limit=20');
      const transactions = data.transactions || [];
      if (transactions.length === 0) {
        box.innerHTML = '<p class="empty">Nenhuma transação recente.</p>';
        return;
      }
      const rows = transactions
        .map(
          (tx) =>
            `<tr>` +
            `<td>${formatDate(tx.createdAt)}</td>` +
            `<td><span class="badge">${esc(tx.type)}</span></td>` +
            `<td>${formatMoney(tx.amount, tx.currency)}</td>` +
            `<td>${esc(tx.description || '')}</td>` +
            `<td><span class="status-${esc(tx.status)}">${esc(tx.status)}</span></td>` +
            `</tr>`,
        )
        .join('');
      box.innerHTML =
        `<table><thead><tr>` +
        `<th>Data</th><th>Tipo</th><th>Valor</th><th>Descrição</th><th>Status</th>` +
        `</tr></thead><tbody>${rows}</tbody></table>`;
    } catch (error) {
      box.innerHTML = `<p class="empty">${esc(error.message)}</p>`;
    }
  }

  /* ---------------- Perfil ---------------- */
  async function loadProfile() {
    const box = $('#profile-box');
    box.innerHTML = 'Carregando…';
    try {
      const user = await api('/auth/me');
      state.user = user;
      storage.save();
      box.innerHTML =
        `<p><strong>Nome:</strong> ${esc(user.firstName || '')} ${esc(user.lastName || '')}</p>` +
        `<p><strong>Username:</strong> ${esc(user.username || '')}</p>` +
        `<p><strong>Email:</strong> ${esc(user.email || '')}</p>` +
        `<p><strong>Status:</strong> <span class="badge">${esc(user.status || '')}</span></p>` +
        `<p><strong>ID:</strong> <span class="pix-box">${esc(user.id || '')}</span></p>` +
        `<p><strong>Criado em:</strong> ${formatDate(user.createdAt)}</p>`;
    } catch (error) {
      box.innerHTML = `<p class="empty">${esc(error.message)}</p>`;
    }
  }

  /* ---------------- Navegação ---------------- */
  function switchTab(tabName) {
    state.selectedBet = null;
    $$('.tab').forEach((el) => el.classList.toggle('active', el.dataset.tab === tabName));
    $$('.tab-panel').forEach((el) => el.classList.toggle('hidden', el.id !== `tab-${tabName}`));
    showMessage('');

    const loaders = {
      saldo: loadWalletOverview,
      eventos: loadEvents,
      historico: () => {
        loadBets();
        loadLedger();
      },
      perfil: loadProfile,
    };
    if (loaders[tabName]) {
      loaders[tabName]();
    }
  }

  function init() {
    $('#login-form').addEventListener('submit', handleLogin);
    $('#register-form').addEventListener('submit', handleRegister);
    $('#logout-btn').addEventListener('click', handleLogout);
    $('#deposit-form').addEventListener('submit', handleDeposit);
    $('#withdraw-form').addEventListener('submit', handleWithdraw);

    $$('.tab').forEach((el) => {
      el.addEventListener('click', () => switchTab(el.dataset.tab));
    });

    const saved = storage.load();
    if (saved && saved.token) {
      api('/auth/me')
        .then((user) => {
          enterApp({ token: saved.token, user });
          showMessage('Sessão restaurada', 'success');
        })
        .catch(() => {
          storage.clear();
          showAuthView();
        });
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();