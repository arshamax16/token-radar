/* Token Radar (radar-2) dashboard: the board, the detail view, and the farm plans.
   Everything it renders comes from window.RADAR, the dataset main.ts wrote; the farm plan is
   derived in the page from the same record the model scored, category by category, so the plan a
   protocol shows is the plan its own figures produce. No network: no fetch, no fonts, no scripts
   beyond this file and the dataset beside it. */
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA || !Array.isArray(DATA.rows)) {
    document.getElementById('board').textContent = 'The dataset beside this page is missing.';
    return;
  }

  var MODEL = DATA.model;
  var GROWTH_FLOOR = MODEL.growth_floor;
  var GROWTH_CAP = MODEL.growth_cap;
  var GROWTH_WEIGHT = MODEL.growth_weight;
  var BASE_MULTIPLE = MODEL.base_multiple;
  var MATURITY_FLOOR = MODEL.maturity_floor;
  var MATURITY_RANGE = MODEL.maturity_range;
  var MATURITY_DAYS = MODEL.maturity_days;
  var UNKNOWN_AGE = MODEL.unknown_age_days;
  var BREADTH_PER = MODEL.breadth_per_chain;
  var BREADTH_MAX = MODEL.breadth_max_chains;

  var state = { q: '', category: 'all', chain: 'all', sort: 'value', tab: 'pre-token', selected: null };
  var app = document.getElementById('board');

  /* ---------- small helpers ---------- */

  function esc(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function fmtUsd(n) {
    if (n === null || n === undefined) return '—';
    var abs = Math.abs(n);
    if (abs >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (abs >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
    if (abs >= 1e3) return '$' + (n / 1e3).toFixed(2) + 'K';
    return '$' + n.toFixed(0);
  }

  function fmtPct(x) {
    if (x === null || x === undefined) return '—';
    return (x > 0 ? '+' : '') + x.toFixed(2) + '%';
  }

  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days < 365) return days + 'd';
    return (days / 365).toFixed(1) + 'y';
  }

  function pctClass(x) {
    if (x === null || x === undefined) return '';
    return x >= 0 ? 'pos' : 'neg';
  }

  function clampGrowth(x) {
    return Math.min(GROWTH_CAP, Math.max(GROWTH_FLOOR, x === null || x === undefined ? 0 : x));
  }

  function chainOf(row) {
    return row.chains && row.chains.length > 0 ? row.chains[0] : 'its main chain';
  }

  /* ---------- farm plans: the same derivation the model uses ---------- */

  function gasNote(chain) {
    var c = String(chain).toLowerCase();
    if (c === 'ethereum') return '$4–8 of gas per transaction';
    if (c === 'solana') return 'under $0.05 of gas per transaction';
    if (['arbitrum', 'optimism', 'base', 'polygon', 'zksync', 'linea', 'scroll', 'blast', 'mantle', 'mode', 'ink', 'unichain', 'world chain', 'bob', 'fraxtal', 'soneium', 'abstract', 'berachain', 'monad', 'megaeth'].some(function (x) { return c.indexOf(x) !== -1; })) return 'under $0.50 of gas per transaction';
    if (['binance', 'avalanche', 'tron', 'fantom', 'gnosis', 'celo', 'cronos', 'kava', 'near', 'aptos', 'sui', 'ton'].some(function (x) { return c.indexOf(x) !== -1; })) return 'under $1 of gas per transaction';
    return 'under $2 of gas per transaction';
  }

  function capitalFor(row) {
    if (row.tvl_usd >= 5000000000) return 500;
    if (row.tvl_usd >= 1000000000) return 250;
    if (row.tvl_usd >= 250000000) return 150;
    if (row.tvl_usd >= 50000000) return 100;
    return 50;
  }

  function holdDaysFor(age) {
    if (age === null || age === undefined) return 60;
    if (age < 180) return 90;
    if (age < 365) return 60;
    return 45;
  }

  function actionsFor(row, capital, chain) {
    var c = (row.category || '').toLowerCase();
    var name = row.name;
    if (c.indexOf('lend') !== -1 || c.indexOf('cdp') !== -1 || c.indexOf('collateral') !== -1) {
      return {
        main: 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and borrow $' + Math.round(capital / 2) + ' against it, keeping the health factor above 2.',
        weekly: 'Repay $25 of the borrow and re-borrow it, so the position shows fresh activity every week.'
      };
    }
    if (c.indexOf('dex') !== -1) {
      return {
        main: 'Provide $' + capital + ' of liquidity to ' + name + "'s largest pool on " + chain + ' and keep the position in range.',
        weekly: 'Swap $25 through the pool once a week, in both directions across the month.'
      };
    }
    if (c.indexOf('yield aggregator') !== -1 || c.indexOf('yield') !== -1) {
      return {
        main: 'Deposit $' + capital + ' of USDC into ' + name + "'s highest-TVL vault on " + chain + ' and hold the vault shares.',
        weekly: "Harvest the vault's yield once a week and redeposit it into the same vault."
      };
    }
    if (c.indexOf('curator') !== -1 || c.indexOf('allocator') !== -1) {
      return {
        main: 'Deposit $' + capital + ' into a ' + name + ' curated vault on ' + chain + ' and hold the vault shares.',
        weekly: "Review the vault's allocation once a week and move $25 to the newest strategy it lists."
      };
    }
    if (c.indexOf('rwa') !== -1) {
      return {
        main: 'Mint $' + capital + " of " + name + "'s yield-bearing asset on " + chain + ' and hold it.',
        weekly: "Reinvest the asset's weekly yield into the same position."
      };
    }
    if (c.indexOf('derivative') !== -1 || c.indexOf('perpetual') !== -1 || c.indexOf('basis') !== -1 || c.indexOf('option') !== -1) {
      return {
        main: 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedged position.',
        weekly: 'Close and reopen the hedge once a week with $25 of margin.'
      };
    }
    if (c.indexOf('bridge') !== -1) {
      return {
        main: 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and deploy the bridged funds in its app.',
        weekly: 'Bridge $25 back and forth once a week through the same route.'
      };
    }
    if (c.indexOf('staking') !== -1 || c.indexOf('restak') !== -1) {
      return {
        main: 'Stake $' + capital + ' through ' + name + ' on ' + chain + ' and keep the receipt token.',
        weekly: 'Restake the staking rewards once a week.'
      };
    }
    if (c.indexOf('prediction') !== -1) {
      return {
        main: 'Fund $' + capital + ' and place one position on a ' + name + ' market that settles after 30 days.',
        weekly: 'Place one $25 position a week on a new market.'
      };
    }
    if (c.indexOf('stable') !== -1) {
      return {
        main: 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.',
        weekly: 'Swap $25 between the stable asset and USDC once a week.'
      };
    }
    if (c.indexOf('insurance') !== -1) {
      return {
        main: 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy active.',
        weekly: "Check the policy's status once a week and top it up by $25 if a claim window opens."
      };
    }
    return {
      main: 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.',
      weekly: 'Make one deposit, swap or vote each week so the wallet stays active.'
    };
  }

  function farmSteps(row) {
    var chain = chainOf(row);
    var capital = capitalFor(row);
    var hold = holdDaysFor(row.age_days);
    var a = actionsFor(row, capital, chain);
    var second = row.chains && row.chains.length > 1 ? row.chains[1] : null;
    var half = Math.max(25, Math.round(capital / 2));
    var steps = [
      { text: 'Open a fresh wallet for this farm, keep its seed phrase offline, and fund it with $' + (capital + 10) + ' on ' + chain + '.', cost: gasNote(chain), time: '10 minutes to set up' },
      { text: a.main, cost: '$' + capital + ' of capital and ' + gasNote(chain), time: '15 minutes to set up' },
      { text: a.weekly, cost: 'about $2 of gas a week', time: '10 minutes a week' },
      second === null
        ? { text: 'Deepen the position after the first week: add $' + half + ' more to the same pool or vault.', cost: '$' + half + ' more capital and ' + gasNote(chain), time: '10 minutes in week 2' }
        : { text: 'Open the same position on ' + second + ' with $' + half + ', so the farm covers two chains.', cost: '$' + half + ' of capital and ' + gasNote(second), time: '15 minutes to set up' },
      { text: 'Hold every position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: 'Before you withdraw, open ' + row.name + "'s own points or rewards page and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Keep a farm log with the wallet, the dates and every transaction hash, then unwind in reverse order and watch the slippage on the way out.', cost: 'nothing but the log', time: '5 minutes a week' }
    ];
    return steps.map(function (s) {
      var t = s.text + ' Cost: ' + s.cost + '. Time: ' + s.time + '.';
      if (t.length > 600) t = t.slice(0, 596) + '...';
      if (t.length < 20) t = t + ' Hold the position and check the protocol\'s own page.';
      return { text: s.text, cost: s.cost, time: s.time, full: t };
    });
  }

  /* ---------- hash routing ---------- */

  function parseHash() {
    var hash = window.location.hash || '';
    state = { q: '', category: 'all', chain: 'all', sort: 'value', tab: 'pre-token', selected: null };
    if (!hash || hash === '#/' || hash === '#') return;
    var body = hash.slice(2);
    if (body.indexOf('protocol/') === 0) {
      state.selected = decodeURIComponent(body.slice(9));
      return;
    }
    if (body.indexOf('filter/') === 0) { state.q = decodeURIComponent(body.slice(7)); return; }
    if (body.indexOf('category/') === 0) { state.category = decodeURIComponent(body.slice(9)); return; }
    if (body.indexOf('chain/') === 0) { state.chain = decodeURIComponent(body.slice(6)); return; }
    if (body.indexOf('tab/') === 0) { state.tab = body.slice(4); return; }
    if (body.indexOf('sort/') === 0) { state.sort = body.slice(5); return; }
    if (body.indexOf('board?') === 0) {
      var params = new URLSearchParams(body.slice(6));
      if (params.get('q')) state.q = params.get('q');
      if (params.get('category')) state.category = params.get('category');
      if (params.get('chain')) state.chain = params.get('chain');
      if (params.get('sort')) state.sort = params.get('sort');
      if (params.get('tab')) state.tab = params.get('tab');
    }
  }

  function writeHash() {
    var next;
    if (state.selected) {
      next = '#/protocol/' + encodeURIComponent(state.selected);
    } else {
      var set = [];
      if (state.q) set.push(['q', state.q]);
      if (state.category !== 'all') set.push(['category', state.category]);
      if (state.chain !== 'all') set.push(['chain', state.chain]);
      if (state.sort !== 'value') set.push(['sort', state.sort]);
      if (state.tab !== 'pre-token') set.push(['tab', state.tab]);
      if (set.length === 0) {
        next = '';
      } else if (set.length === 1 && set[0][0] === 'q') {
        next = '#/filter/' + encodeURIComponent(state.q);
      } else if (set.length === 1 && set[0][0] === 'category') {
        next = '#/category/' + encodeURIComponent(state.category);
      } else if (set.length === 1 && set[0][0] === 'chain') {
        next = '#/chain/' + encodeURIComponent(state.chain);
      } else if (set.length === 1 && set[0][0] === 'tab') {
        next = '#/tab/' + state.tab;
      } else if (set.length === 1 && set[0][0] === 'sort') {
        next = '#/sort/' + state.sort;
      } else {
        next = '#/board?' + new URLSearchParams(set).toString();
      }
    }
    if (next !== window.location.hash) {
      if (next === '') history.replaceState(null, '', window.location.pathname + window.location.search);
      else window.location.hash = next;
    }
  }

  /* ---------- filtering and sorting ---------- */

  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    var rows = DATA.rows.filter(function (r) {
      if (state.category !== 'all' && (r.category || '') !== state.category) return false;
      if (state.chain !== 'all' && (!r.chains || r.chains.indexOf(state.chain) === -1)) return false;
      if (q) {
        var hay = (r.name + ' ' + (r.category || '') + ' ' + (r.chains || []).join(' ') + ' ' + r.slug).toLowerCase();
        if (hay.indexOf(q) === -1) return false;
      }
      return true;
    });
    var by = {
      value: function (a, b) { return b.implied_value_usd - a.implied_value_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0); },
      tvl: function (a, b) { return b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0); },
      growth: function (a, b) { return (b.change_7d === null ? -Infinity : b.change_7d) - (a.change_7d === null ? -Infinity : a.change_7d); },
      age: function (a, b) { return (b.age_days === null ? UNKNOWN_AGE : b.age_days) - (a.age_days === null ? UNKNOWN_AGE : a.age_days); },
      name: function (a, b) { return a.name.localeCompare(b.name); }
    };
    return rows.slice().sort(by[state.sort] || by.value);
  }

  function distinctCategories() {
    var seen = {};
    var out = [];
    DATA.rows.forEach(function (r) {
      var c = r.category || 'Uncategorized';
      if (!seen[c]) { seen[c] = true; out.push(c); }
    });
    return out.sort();
  }

  function topChains(limit) {
    var counts = {};
    DATA.rows.forEach(function (r) {
      (r.chains || []).forEach(function (c) { counts[c] = (counts[c] || 0) + 1; });
    });
    var list = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; });
    if (state.chain !== 'all' && list.indexOf(state.chain) === -1) list.unshift(state.chain);
    return list.slice(0, limit);
  }

  /* ---------- rendering ---------- */

  function topBar() {
    return '<div class="top">' +
      '<div class="brand"><span class="mark" aria-hidden="true"></span><span class="brand-name">Token Radar</span></div>' +
      '<div class="top-meta"><span>Snapshot <b>' + esc(DATA.as_of) + '</b></span><span>Model <b>' + esc(DATA.model_version) + '</b></span><span>Watchlist floor <b>' + fmtUsd(DATA.floor_usd) + '</b></span></div>' +
      '</div>';
  }

  function hero() {
    var max = DATA.rows.length > 0 ? DATA.rows[0].implied_value_usd : 0;
    return '<section class="hero">' +
      '<div><h1>' + DATA.watchlist_size + ' watchlist protocols, ranked by the value a token would price.</h1>' +
      '<p>The radar scores every protocol on the watchlist, then adds the pre-token protocols below the <b>' + fmtUsd(DATA.floor_usd) + '</b> floor that are not a wrapped, staked or bridged product — <b>' + DATA.early_size + ' early finds</b> this snapshot. The top implied value is <b>' + fmtUsd(max) + '</b>. Live-token protocols are kept apart, in the Live token tab, with the market cap the market already gives them.</p></div>' +
      '<div class="stats">' +
      '<div class="stat"><span>Watchlist on the board</span><b>' + DATA.watchlist_size + ' <small>/ ' + DATA.watchlist_size + '</small></b></div>' +
      '<div class="stat"><span>Pre-token rows</span><b>' + DATA.board_size + '</b></div>' +
      '<div class="stat"><span>Early finds below the floor</span><b>' + DATA.early_size + '</b></div>' +
      '<div class="stat"><span>Live tokens set aside</span><b>' + DATA.live_size + '</b></div>' +
      '</div></section>';
  }

  function spotlight() {
    var max = DATA.rows.length > 0 ? DATA.rows[0].implied_value_usd : 1;
    var cards = DATA.rows.slice(0, 5).map(function (r) {
      var w = Math.max(2, Math.round((r.implied_value_usd / max) * 100));
      return '<button class="card" data-protocol="' + esc(r.slug) + '" type="button">' +
        '<span class="rank">#' + r.rank + '</span><b>' + esc(r.name) + '</b>' +
        '<span class="sub">' + esc(r.category || 'Uncategorized') + ' · ' + fmtUsd(r.tvl_usd) + ' TVL</span>' +
        '<span class="val">' + fmtUsd(r.implied_value_usd) + '</span>' +
        '<span class="bar" aria-hidden="true"><i style="width:' + w + '%"></i></span></button>';
    }).join('');
    return '<div class="spot-head"><h2>Top 5 by implied value</h2><span>Click a card for its model and farm plan</span></div>' +
      '<div class="spot">' + cards + '</div>';
  }

  function controls() {
    var cats = distinctCategories().map(function (c) {
      return '<option value="' + esc(c) + '"' + (state.category === c ? ' selected' : '') + '>' + esc(c) + '</option>';
    }).join('');
    var chains = topChains(24).map(function (c) {
      return '<option value="' + esc(c) + '"' + (state.chain === c ? ' selected' : '') + '>' + esc(c) + '</option>';
    }).join('');
    var sortLabel = { value: 'Implied value', tvl: 'TVL', growth: '7d growth', age: 'Age', name: 'Name' };
    var sortOpts = Object.keys(sortLabel).map(function (k) {
      return '<option value="' + k + '"' + (state.sort === k ? ' selected' : '') + '>' + sortLabel[k] + '</option>';
    }).join('');
    return '<div class="controls">' +
      '<div class="field"><label for="q">Search the board</label><input id="q" type="search" placeholder="Name, category, chain or slug" value="' + esc(state.q) + '"></div>' +
      '<div class="field"><label for="cat">Category</label><select id="cat"><option value="all">All categories</option>' + cats + '</select></div>' +
      '<div class="field"><label for="chain">Chain</label><select id="chain"><option value="all">All chains</option>' + chains + '</select></div>' +
      '<div class="field"><label for="sort">Sort by</label><select id="sort">' + sortOpts + '</select></div>' +
      '<div class="tabs" role="group" aria-label="Board tab">' +
      '<button type="button" data-tab="pre-token" aria-pressed="' + (state.tab === 'pre-token') + '">Pre-token</button>' +
      '<button type="button" data-tab="live" aria-pressed="' + (state.tab === 'live') + '">Live token</button>' +
      '</div>' +
      '<span class="count" id="count"></span>' +
      '</div>';
  }

  function boardTable(rows) {
    if (rows.length === 0) {
      return '<div class="empty"><h2>Nothing matches</h2><p>Try a shorter search, a different category, or clear the filters.</p><button class="button primary" type="button" data-clear="1">Clear all filters</button></div>';
    }
    var max = rows.reduce(function (m, r) { return Math.max(m, r.implied_value_usd); }, 1);
    var body = rows.map(function (r) {
      var w = Math.max(2, Math.round((r.implied_value_usd / max) * 100));
      var chains = (r.chains || []).slice(0, 3).join(', ');
      var extra = (r.chains || []).length > 3 ? ' +' + ((r.chains || []).length - 3) : '';
      return '<tr data-protocol="' + esc(r.slug) + '" data-selected="' + (state.selected === r.slug) + '">' +
        '<td><span class="rank-badge">#' + r.rank + '</span></td>' +
        '<td><span class="name"><b>' + esc(r.name) + '</b><span class="sub">' + esc(r.category || 'Uncategorized') + (chains ? ' · ' + esc(chains) + extra : '') + '</span></span></td>' +
        '<td class="num">' + fmtUsd(r.tvl_usd) + '</td>' +
        '<td class="num ' + pctClass(r.change_7d) + '">' + fmtPct(r.change_7d) + '</td>' +
        '<td class="num">' + fmtAge(r.age_days) + '</td>' +
        '<td class="num">' + (r.chains || []).length + '</td>' +
        '<td><span class="implied"><span class="num">' + fmtUsd(r.implied_value_usd) + '</span><span class="bar" aria-hidden="true"><i style="width:' + w + '%"></i></span></span></td>' +
        '<td><span class="pill">7 steps</span></td>' +
        '</tr>';
    }).join('');
    return '<div class="panel"><div class="table-wrap"><table>' +
      '<thead><tr>' +
      '<th><button type="button" data-sort="value">Rank</button></th>' +
      '<th><button type="button" data-sort="name">Protocol</button></th>' +
      '<th><button type="button" data-sort="tvl">TVL</button></th>' +
      '<th><button type="button" data-sort="growth">7d</button></th>' +
      '<th><button type="button" data-sort="age">Age</button></th>' +
      '<th>Chains</th>' +
      '<th><button type="button" data-sort="value">Implied value</button></th>' +
      '<th>Farm plan</th>' +
      '</tr></thead><tbody>' + body + '</tbody></table></div></div>';
  }

  function liveTable() {
    var live = DATA.live || [];
    if (live.length === 0) return '<div class="empty"><h2>No live-token protocols</h2><p>Every protocol in this snapshot is pre-token.</p></div>';
    var body = live.map(function (r) {
      return '<tr class="noclick">' +
        '<td><span class="pill live">Live token</span></td>' +
        '<td><span class="name"><b>' + esc(r.name) + '</b><span class="sub">' + esc(r.category || 'Uncategorized') + ' · ' + esc((r.chains || []).slice(0, 3).join(', ')) + '</span></span></td>' +
        '<td class="num">' + fmtUsd(r.tvl_usd) + '</td>' +
        '<td class="num ' + pctClass(r.change_7d) + '">' + fmtPct(r.change_7d) + '</td>' +
        '<td class="num">' + fmtUsd(r.mcap_usd) + '</td>' +
        '</tr>';
    }).join('');
    return '<p class="sub" style="margin-bottom:12px">These protocols already trade. The board does not rank them: the market cap beside each is the value the market gives, and the radar keeps that value apart from the model, so a live token never tops a pre-token board.</p>' +
      '<div class="panel"><div class="table-wrap"><table>' +
      '<thead><tr><th>Status</th><th>Protocol</th><th>TVL</th><th>7d</th><th>Market cap</th></tr></thead><tbody>' + body + '</tbody></table></div></div>';
  }

  function modelPanel() {
    return '<section class="panel model" aria-label="How the radar scores">' +
      '<h2>How the radar scores</h2>' +
      '<div class="formula">implied = TVL × ' + BASE_MULTIPLE + ' × (1 + ' + GROWTH_WEIGHT + ' × clamp(7d, ' + GROWTH_FLOOR + ', +' + GROWTH_CAP + ') / 100)<br>' +
      '× (0.55 + 0.45 × ln(1 + age_days) / ln(1 + ' + MATURITY_DAYS + '))<br>' +
      '× (1 + ' + BREADTH_PER + ' × min(chains, ' + BREADTH_MAX + '))</div>' +
      '<div class="factors">' +
      '<div class="factor"><b>TVL × 0.30</b><span>The size of the business a token would price. The base is 30% of total value locked.</span></div>' +
      '<div class="factor"><b>7d growth</b><span>Momentum, weighted half and clamped at −80% to +200%, so one wild week on a small base is noise, not a business.</span></div>' +
      '<div class="factor"><b>Age with no token</b><span>Staying power, logged: the tenth year adds less than the first. A protocol with no listed date counts as one year old.</span></div>' +
      '<div class="factor"><b>Chain breadth</b><span>Reach, 4% a chain up to eight. Listing on twenty chains does not beat listing on eight.</span></div>' +
      '</div>' +
      '<p><b>One rule above all:</b> the same function scores every row — no protocol name is ever special-cased. And the implied value is a model, not a price: it says what the numbers would justify, not what a market will pay.</p>' +
      '</section>';
  }

  function footer() {
    return '<footer class="foot">' +
      '<span>Snapshot ' + esc(DATA.as_of) + ' · Source: the DefiLlama protocol index, as recorded in the snapshot.</span>' +
      '<span>“Records no token” means the record carries no market cap, no CoinGecko id and no symbol — it is not proof the protocol has no token. Verify a protocol on its own pages before you farm it.</span>' +
      '<span>Token Radar ' + esc(DATA.model_version) + ' · a static page: no network, no tracking, no account.</span>' +
      '</footer>';
  }

  function detailView(row) {
    var steps = farmSteps(row);
    var growthPct = clampGrowth(row.change_7d);
    var base = row.tvl_usd * BASE_MULTIPLE;
    var age = row.age_days === null || row.age_days === undefined ? UNKNOWN_AGE : row.age_days;
    var maturity = MATURITY_FLOOR + (Math.log(1 + Math.max(age, 0)) / Math.log(1 + MATURITY_DAYS)) * MATURITY_RANGE;
    var breadth = 1 + BREADTH_PER * Math.min((row.chains || []).length, BREADTH_MAX);
    var stepItems = steps.map(function (s) {
      return '<li><b>' + esc(s.text) + '</b><span class="cost">Cost: ' + esc(s.cost) + ' · Time: ' + esc(s.time) + '</span></li>';
    }).join('');
    return '<section class="panel detail">' +
      '<div class="detail-head"><div>' +
      '<span class="crumb">RANK #' + row.rank + ' · PRE-TOKEN · ' + esc(row.category || 'Uncategorized') + '</span>' +
      '<h2>' + esc(row.name) + '</h2>' +
      '<span class="sub">' + esc((row.chains || []).join(', ')) + ' · Listed ' + (row.listed_at ? esc(row.listed_at) : 'date unknown') + '</span>' +
      '</div><button class="back" type="button" data-back="1">← Back to the board</button></div>' +
      '<div class="kv">' +
      '<div class="kv-cell"><span>Implied value</span><b class="green">' + fmtUsd(row.implied_value_usd) + '</b></div>' +
      '<div class="kv-cell"><span>Total value locked</span><b>' + fmtUsd(row.tvl_usd) + '</b></div>' +
      '<div class="kv-cell"><span>7d change</span><b class="' + pctClass(row.change_7d) + '">' + fmtPct(row.change_7d) + '</b></div>' +
      '<div class="kv-cell"><span>Age with no token</span><b>' + fmtAge(row.age_days) + '</b></div>' +
      '<div class="kv-cell"><span>Chains</span><b>' + (row.chains || []).length + '</b></div>' +
      '<div class="kv-cell"><span>Model</span><b>' + esc(DATA.model_version) + '</b></div>' +
      '</div>' +
      '<div class="detail-section"><h3>The model, step by step</h3>' +
      '<div class="eq">' +
      '<div><span>Base — TVL × ' + BASE_MULTIPLE + '</span><b>' + fmtUsd(base) + '</b></div>' +
      '<div><span>Growth — clamp(' + fmtPct(row.change_7d) + ', ' + GROWTH_FLOOR + ', +' + GROWTH_CAP + ') → ×' + row.growth_multiplier.toFixed(2) + '</span><b>' + growthPct.toFixed(2) + '% counted</b></div>' +
      '<div><span>Maturity — ' + fmtAge(row.age_days) + ' with no token → ×' + maturity.toFixed(2) + '</span><b>' + row.maturity_multiplier.toFixed(2) + '</b></div>' +
      '<div><span>Breadth — ' + (row.chains || []).length + ' chains → ×' + breadth.toFixed(2) + '</span><b>' + row.breadth_multiplier.toFixed(2) + '</b></div>' +
      '<div><span>Implied value — base × growth × maturity × breadth</span><b>' + fmtUsd(row.implied_value_usd) + '</b></div>' +
      '</div>' +
      '<p>' + esc(row.name) + ' records no token in this snapshot, so its rank comes from the model alone. A protocol that trades already is never on this board; its value is the market cap the market gives it.</p></div>' +
      '<div class="detail-section"><h3>Farm plan — 7 steps</h3>' +
      '<ol class="steps">' + stepItems + '</ol>' +
      '<p>The plan is built from this protocol’s own record: its category, its chains, its TVL and its age. The cost figures are budgets, not promises — check the live gas price and the live fees before you deposit.</p></div>' +
      '</section>';
  }

  function render() {
    var html = '<div class="shell">' + topBar() + hero();
    if (state.selected) {
      var row = null;
      for (var i = 0; i < DATA.rows.length; i++) if (DATA.rows[i].slug === state.selected) { row = DATA.rows[i]; break; }
      html += row ? detailView(row) : '<div class="empty"><h2>No protocol with that slug</h2><p>The link names a protocol this snapshot does not carry.</p><button class="button primary" type="button" data-back="1">Back to the board</button></div>';
      html += modelPanel() + footer() + '</div>';
      app.innerHTML = html;
      return;
    }
    html += spotlight() + controls();
    if (state.tab === 'live') {
      html += liveTable();
      var countLive = (DATA.live || []).length;
      html += modelPanel() + footer() + '</div>';
      app.innerHTML = html;
      var c = document.getElementById('count');
      if (c) c.textContent = countLive + ' live-token protocols';
      return;
    }
    var rows = filteredRows();
    html += boardTable(rows);
    html += modelPanel() + footer() + '</div>';
    app.innerHTML = html;
    var count = document.getElementById('count');
    if (count) count.textContent = rows.length + ' of ' + DATA.rows.length + ' rows';
  }

  function setState(patch) {
    for (var k in patch) state[k] = patch[k];
    writeHash();
    render();
  }

  /* ---------- events ---------- */

  app.addEventListener('click', function (e) {
    var t = e.target;
    while (t && t !== app) {
      if (t.hasAttribute && t.hasAttribute('data-protocol')) {
        setState({ selected: t.getAttribute('data-protocol') });
        window.scrollTo(0, 0);
        return;
      }
      if (t.hasAttribute && t.hasAttribute('data-tab')) {
        setState({ tab: t.getAttribute('data-tab'), selected: null });
        return;
      }
      if (t.hasAttribute && t.hasAttribute('data-sort')) {
        setState({ sort: t.getAttribute('data-sort') });
        return;
      }
      if (t.hasAttribute && t.hasAttribute('data-back')) {
        setState({ selected: null });
        return;
      }
      if (t.hasAttribute && t.hasAttribute('data-clear')) {
        setState({ q: '', category: 'all', chain: 'all', sort: 'value', tab: 'pre-token' });
        return;
      }
      t = t.parentElement;
    }
  });

  app.addEventListener('input', function (e) {
    var t = e.target;
    if (t.id === 'q') {
      state.q = t.value;
      writeHash();
      render();
      var q = document.getElementById('q');
      if (q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
    }
  });

  app.addEventListener('change', function (e) {
    var t = e.target;
    if (t.id === 'cat') setState({ category: t.value });
    if (t.id === 'chain') setState({ chain: t.value });
    if (t.id === 'sort') setState({ sort: t.value });
  });

  window.addEventListener('hashchange', function () {
    parseHash();
    render();
  });

  parseHash();
  render();
  app.removeAttribute('aria-busy');
})();
