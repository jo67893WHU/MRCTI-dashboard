const DATA = window.MRCTI_DATA.utilities;
const MODELS = window.MRCTI_DATA.models;
const META = window.MRCTI_DATA.meta;
const $ = (selector) => document.querySelector(selector);
const fmt = new Intl.NumberFormat('en-US');
const money = new Intl.NumberFormat('en-US', {style: 'currency', currency: 'USD', maximumFractionDigits: 0});
const pct = new Intl.NumberFormat('en-US', {maximumFractionDigits: 2});

let ui = {search: '', state: '', ownership: '', source: '', coverage: '', condition: '', mapMetric: 'count', rank: 'burden', page: 1};
let stateGeo = null;
const PAGE_SIZE = 25;

function finite(v) { return v !== null && v !== undefined && Number.isFinite(Number(v)); }
function median(values) {
  const sorted = values.filter(finite).map(Number).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
function openFlag(v) { return ['yes', 'true', '1', 'y'].includes(String(v).toLowerCase()); }
function optionList(selector, values) {
  const control = $(selector);
  [...new Set(values.filter(Boolean))].sort().forEach(value => control.insertAdjacentHTML('beforeend', `<option value="${value}">${value}</option>`));
}

optionList('#stateFilter', DATA.map(d => d.st));
optionList('#ownerFilter', DATA.map(d => d.own));
optionList('#sourceFilter', DATA.map(d => d.src));

function currentRows() {
  const q = ui.search.trim().toLowerCase();
  return DATA.filter(d =>
    (!q || d.id.toLowerCase().includes(q) || (d.name || '').toLowerCase().includes(q)) &&
    (!ui.state || d.st === ui.state) &&
    (!ui.ownership || d.own === ui.ownership) &&
    (!ui.source || d.src === ui.source) &&
    (!ui.coverage || d.coverage === ui.coverage) &&
    (!ui.condition ||
      (ui.condition === 'open' && openFlag(d.open)) ||
      (ui.condition === 'burden' && finite(d.burden) && d.burden >= 2) ||
      (ui.condition === 'health10' && finite(d.h10) && d.h10 > 0) ||
      (ui.condition === 'recovery' && finite(d.recovery) && d.recovery < 1))
  );
}

function render() {
  const rows = currentRows();
  renderSummary(rows);
  renderMap(rows);
  renderHistogram(rows);
  renderTable(rows);
}

function renderSummary(rows) {
  const population = rows.reduce((sum, d) => sum + (finite(d.pop) ? Number(d.pop) : 0), 0);
  const burdenValues = rows.map(d => d.burden).filter(finite);
  const financial = rows.filter(d => d.coverage !== 'EMMA only').length;
  const summaries = [
    ['Utility records', fmt.format(rows.length), `${pct.format(rows.length / META.uniqueUtilities * 100)}% of national base`],
    ['Population served', fmt.format(Math.round(population)), 'Sum of selected system populations'],
    ['Median charge burden', burdenValues.length ? `${pct.format(median(burdenValues))}%` : '—', `${fmt.format(burdenValues.length)} records with charge and income`],
    ['Financial data coverage', rows.length ? `${pct.format(financial / rows.length * 100)}%` : '—', `${fmt.format(financial)} utilities with matched financial records`]
  ];
  $('#summaryStrip').innerHTML = summaries.map(([label, value, context]) => `<div class="summary-item"><span class="summary-label">${label}</span><strong class="summary-value">${value}</strong><span class="summary-context">${context}</span></div>`).join('');
}

function aggregateByState(rows) {
  const groups = d3.group(rows.filter(d => d.st), d => d.st);
  const stats = new Map();
  groups.forEach((items, state) => {
    const population = d3.sum(items, d => finite(d.pop) ? Number(d.pop) : 0);
    stats.set(state, {
      count: items.length,
      burden: median(items.map(d => d.burden)),
      charge: median(items.map(d => d.charge)),
      h10rate: population ? d3.sum(items, d => finite(d.h10) ? Number(d.h10) : 0) / population * 1000 : null,
      coverage: items.length ? items.filter(d => d.coverage !== 'EMMA only').length / items.length * 100 : null
    });
  });
  return stats;
}

function mapValueLabel(value, metric) {
  if (!finite(value)) return 'No data';
  if (metric === 'charge') return money.format(value);
  if (metric === 'burden' || metric === 'coverage') return `${pct.format(value)}%`;
  if (metric === 'h10rate') return `${pct.format(value)} per 1,000`;
  return fmt.format(Math.round(value));
}

function renderMap(rows) {
  if (!stateGeo || typeof d3 === 'undefined') return;
  const wrap = $('#mapWrap');
  const width = Math.max(320, wrap.clientWidth);
  const height = Math.max(260, wrap.clientHeight);
  const svg = d3.select('#stateMap').attr('viewBox', `0 0 ${width} ${height}`);
  svg.selectAll('*').remove();
  const projection = d3.geoAlbersUsa().fitExtent([[18, 18], [width - 18, height - 18]], stateGeo);
  const path = d3.geoPath(projection);
  const stats = aggregateByState(rows);
  const values = [...stats.values()].map(d => d[ui.mapMetric]).filter(finite);
  const noGeographicData = rows.length === 0 || values.length === 0;
  wrap.classList.toggle('is-empty', noGeographicData);
  $('#mapEmptyState').hidden = !noGeographicData;
  const domain = ui.mapMetric === 'coverage' ? [0, 100] : (values.length ? d3.extent(values) : [0, 1]);
  if (domain[0] === domain[1]) domain[1] = domain[0] + 1;
  const color = d3.scaleSequential().domain(domain).interpolator(t => d3.interpolateRgb('#e6eef2', '#2c678c')(t));
  const tooltip = $('#mapTooltip');

  svg.selectAll('path').data(stateGeo.features).join('path')
    .attr('class', d => {
      const state = d.properties.STUSPS;
      return `state-shape${stats.has(state) ? '' : ' no-data'}${ui.state === state ? ' selected' : ''}`;
    })
    .attr('d', path)
    .attr('fill', d => {
      const value = stats.get(d.properties.STUSPS)?.[ui.mapMetric];
      return finite(value) ? color(value) : '#edf0f2';
    })
    .on('mousemove', (event, d) => {
      const state = d.properties.STUSPS;
      const item = stats.get(state);
      tooltip.hidden = false;
      tooltip.innerHTML = `<strong>${d.properties.NAME}</strong><br>${item ? `${mapValueLabel(item[ui.mapMetric], ui.mapMetric)} · ${fmt.format(item.count)} utilities` : 'No selected records'}`;
      const bounds = wrap.getBoundingClientRect();
      tooltip.style.left = `${Math.min(event.clientX - bounds.left + 12, width - 190)}px`;
      tooltip.style.top = `${Math.max(8, event.clientY - bounds.top - 18)}px`;
    })
    .on('mouseleave', () => { tooltip.hidden = true; })
    .on('click', (_, d) => {
      const state = d.properties.STUSPS;
      ui.state = ui.state === state ? '' : state;
      $('#stateFilter').value = ui.state;
      ui.page = 1;
      render();
    });

  $('#legendLow').textContent = noGeographicData ? 'No data' : mapValueLabel(domain[0], ui.mapMetric);
  $('#legendHigh').textContent = noGeographicData ? '—' : mapValueLabel(domain[1], ui.mapMetric);
  $('#mapSelectionLabel').textContent = ui.state ? `${ui.state} selected · click again to clear` : 'Click a state to filter';
}

function renderHistogram(rows) {
  const container = $('#histogram');
  const raw = rows.map(d => Number(d.burden)).filter(Number.isFinite).sort(d3.ascending);
  container.innerHTML = '';
  if (!raw.length) {
    container.innerHTML = '<div class="empty-chart">No charge-burden observations in this selection.</div>';
    $('#distributionNote').textContent = 'Charge burden requires both annual charge and median household income.';
    return;
  }
  const width = Math.max(300, container.clientWidth);
  const height = Math.max(250, container.clientHeight);
  const margin = {top: 18, right: 12, bottom: 38, left: 44};
  const cap = Math.max(2.5, d3.quantile(raw, .98));
  const clipped = raw.map(v => Math.min(v, cap));
  const bins = d3.bin().domain([0, cap]).thresholds(18)(clipped);
  const x = d3.scaleLinear().domain([0, cap]).range([margin.left, width - margin.right]);
  const y = d3.scaleLinear().domain([0, d3.max(bins, d => d.length)]).nice().range([height - margin.bottom, margin.top]);
  const svg = d3.select(container).append('svg').attr('viewBox', `0 0 ${width} ${height}`);
  svg.append('g').selectAll('rect').data(bins).join('rect').attr('class', 'bar')
    .attr('x', d => x(d.x0) + 1).attr('y', d => y(d.length)).attr('width', d => Math.max(0, x(d.x1) - x(d.x0) - 2)).attr('height', d => y(0) - y(d.length));
  svg.append('g').attr('class', 'axis').attr('transform', `translate(0,${height - margin.bottom})`).call(d3.axisBottom(x).ticks(5).tickFormat(d => `${d}%`));
  svg.append('g').attr('class', 'axis').attr('transform', `translate(${margin.left},0)`).call(d3.axisLeft(y).ticks(5).tickFormat(d3.format('~s')));
  if (2 <= cap) {
    svg.append('line').attr('class', 'threshold').attr('x1', x(2)).attr('x2', x(2)).attr('y1', margin.top).attr('y2', height - margin.bottom);
    svg.append('text').attr('class', 'threshold-label').attr('x', x(2) + 4).attr('y', margin.top + 10).text('2% screen');
  }
  svg.append('text').attr('x', (margin.left + width - margin.right) / 2).attr('y', height - 5).attr('text-anchor', 'middle').attr('fill', '#52616c').attr('font-size', 10).text('Annual charge / median household income');
  const high = raw.filter(v => v >= 2).length;
  $('#distributionNote').innerHTML = `<strong>${fmt.format(high)}</strong> of ${fmt.format(raw.length)} observed records meet or exceed the 2% screening threshold. Values above the 98th percentile are grouped in the final bin.`;
}

function rankValue(d) {
  if (ui.rank === 'recoveryAsc') return finite(d.recovery) ? -Number(d.recovery) : -Infinity;
  return finite(d[ui.rank]) ? Number(d[ui.rank]) : -Infinity;
}
function coverageClass(value) { return value.startsWith('Public') ? 'public' : (value.startsWith('Private') ? 'private' : ''); }

function renderTable(rows) {
  const sorted = [...rows].sort((a, b) => rankValue(b) - rankValue(a));
  const pages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  ui.page = Math.min(ui.page, pages);
  const start = (ui.page - 1) * PAGE_SIZE;
  const pageRows = sorted.slice(start, start + PAGE_SIZE);
  $('#resultCount').textContent = `${fmt.format(sorted.length)} records after filters`;
  $('#resultsBody').innerHTML = pageRows.map((d, index) => `<tr data-id="${d.id}">
    <td>${fmt.format(start + index + 1)}</td>
    <td><span class="record-name">${d.name || 'Name unavailable'}</span><span class="record-id">${d.id}</span></td>
    <td>${d.st || '—'}</td><td>${d.own || '—'}</td>
    <td class="num">${finite(d.pop) ? fmt.format(Math.round(d.pop)) : '—'}</td>
    <td class="num">${finite(d.charge) ? money.format(d.charge) : '—'}</td>
    <td class="num">${finite(d.burden) ? `${pct.format(d.burden)}%` : '—'}</td>
    <td class="num">${finite(d.h10) ? fmt.format(d.h10) : '—'}</td>
    <td><span class="coverage-tag ${coverageClass(d.coverage)}">${d.coverage}</span></td></tr>`).join('');
  $('#pageLabel').textContent = `Page ${ui.page} of ${pages}`;
  $('#prevBtn').disabled = ui.page === 1;
  $('#nextBtn').disabled = ui.page === pages;
  document.querySelectorAll('#resultsBody tr').forEach(row => row.addEventListener('click', () => openDetail(DATA.find(d => d.id === row.dataset.id))));
}

function openDetail(d) {
  const values = [
    ['Population served', finite(d.pop) ? fmt.format(Math.round(d.pop)) : '—'],
    ['Service connections', finite(d.conn) ? fmt.format(Math.round(d.conn)) : '—'],
    ['Annual average charge', finite(d.charge) ? money.format(d.charge) : '—'],
    ['Median household income', finite(d.mhi) ? money.format(d.mhi) : '—'],
    ['Charge burden', finite(d.burden) ? `${pct.format(d.burden)}%` : '—'],
    ['10-year health violations', finite(d.h10) ? fmt.format(d.h10) : '—'],
    ['All-year total violations', finite(d.tAll) ? fmt.format(d.tAll) : '—'],
    ['Cost recovery', finite(d.recovery) ? pct.format(d.recovery) : '—'],
    ['Outstanding debt', finite(d.debt) ? money.format(d.debt * 1000) : '—'],
    ['Data coverage', d.coverage]
  ];
  $('#drawerContent').innerHTML = `<p class="detail-kicker">UTILITY PROFILE</p><h2 class="detail-title">${d.name || 'Name unavailable'}</h2><p class="detail-id">${d.id} · ${d.st || 'State unavailable'} · ${d.own || 'Ownership unavailable'} · ${d.src || 'Source unavailable'}</p><div class="detail-table">${values.map(([k, v]) => `<div class="detail-row"><span>${k}</span><strong>${v}</strong></div>`).join('')}</div><h3 class="detail-section">Interpretation</h3><p class="definition">This profile presents observed screening variables. It does not yet include a model prediction, residual, anomaly percentile, or verified service-area geometry. Missing financial values indicate that no matching financial record was available.</p>`;
  $('#detailDrawer').classList.add('open');
  $('#scrim').classList.add('open');
  $('#detailDrawer').setAttribute('aria-hidden', 'false');
}
function closeDetail() { $('#detailDrawer').classList.remove('open'); $('#scrim').classList.remove('open'); $('#detailDrawer').setAttribute('aria-hidden', 'true'); }

function renderModels() {
  const layer = $('#modelLayer').value;
  const rows = MODELS.filter(d => !layer || d.layer === layer);
  const value = v => finite(v) ? Number(v).toFixed(3) : '—';
  $('#modelBody').innerHTML = rows.map(d => `<tr><td>${d.layer}</td><td>${d.outcome}</td><td class="num">${finite(d.n) ? fmt.format(d.n) : '—'}</td><td class="num">${finite(d.features) ? fmt.format(d.features) : '—'}</td><td class="num">${value(d.trainR2)}</td><td class="num">${value(d.cvR2)}</td><td class="num">${value(d.cvRmse)}</td><td class="num">${value(d.cvMae)}</td></tr>`).join('');
}

document.querySelectorAll('.nav-item').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b === button));
  document.querySelectorAll('.view').forEach(view => view.classList.remove('active'));
  $(`#${button.dataset.view}View`).classList.add('active');
  if (button.dataset.view === 'screen') {
    setTimeout(() => { renderMap(currentRows()); renderHistogram(currentRows()); }, 0);
    setTimeout(() => { renderMap(currentRows()); }, 180);
  }
}));

[
  ['#search', 'search', 'input'], ['#stateFilter', 'state', 'change'], ['#ownerFilter', 'ownership', 'change'],
  ['#sourceFilter', 'source', 'change'], ['#coverageFilter', 'coverage', 'change'], ['#riskFilter', 'condition', 'change'],
  ['#metricSelect', 'mapMetric', 'change'], ['#rankMetric', 'rank', 'change']
].forEach(([selector, key, eventName]) => $(selector).addEventListener(eventName, event => { ui[key] = event.target.value; ui.page = 1; render(); }));

$('#resetBtn').addEventListener('click', () => {
  ui = {search: '', state: '', ownership: '', source: '', coverage: '', condition: '', mapMetric: 'count', rank: 'burden', page: 1};
  ['#search', '#stateFilter', '#ownerFilter', '#sourceFilter', '#coverageFilter', '#riskFilter'].forEach(selector => { $(selector).value = ''; });
  $('#metricSelect').value = 'count'; $('#rankMetric').value = 'burden'; render();
});
$('#prevBtn').addEventListener('click', () => { ui.page--; renderTable(currentRows()); });
$('#nextBtn').addEventListener('click', () => { ui.page++; renderTable(currentRows()); });
$('#closeDrawer').addEventListener('click', closeDetail); $('#scrim').addEventListener('click', closeDetail);
$('#modelLayer').addEventListener('change', renderModels);
let evidenceOutcome = 'charge';
function updateEvidenceFigures() {
  const dataset = $('#evidenceDataset').value;
  const datasetLabel = dataset === 'emma' ? 'EMMA' : dataset[0].toUpperCase() + dataset.slice(1);
  const outcomeLabel = evidenceOutcome === 'charge' ? 'annual water charge' : '10-year health violations';
  $('#importanceFigure').src = `assets/model-evidence/${dataset}-${evidenceOutcome}-feature-importance.jpg`;
  $('#importanceFigure').alt = `${datasetLabel} ${outcomeLabel} random forest feature importance`;
  $('#shapFigure').src = `assets/model-evidence/${dataset}-${evidenceOutcome}-shap.jpg`;
  $('#shapFigure').alt = `${datasetLabel} ${outcomeLabel} SHAP summary`;
  $('#importanceTitle').textContent = `${datasetLabel} feature importance`;
  $('#shapTitle').textContent = `${datasetLabel} SHAP distribution`;
  $('#shapCaption').textContent = evidenceOutcome === 'charge' ? 'Positive values raise predicted annual charge; negative values lower it.' : 'Positive values raise predicted violation counts; negative values lower them.';
}
document.querySelectorAll('.outcome-button').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('.outcome-button').forEach(item => item.classList.toggle('active', item === button));
  evidenceOutcome = button.dataset.modelOutcome;
  updateEvidenceFigures();
}));
$('#evidenceDataset').addEventListener('change', updateEvidenceFigures);
$('#exportBtn').addEventListener('click', () => {
  const rows = currentRows();
  const headers = ['pwsid','name','state','ownership','source','population','annual_charge','charge_burden_pct','health_violations_10yr','total_violations_all_years','financial_coverage','cost_recovery'];
  const quote = v => `"${String(v ?? '').replaceAll('"', '""')}"`;
  const csv = [headers.join(','), ...rows.map(d => [d.id,d.name,d.st,d.own,d.src,d.pop,d.charge,d.burden,d.h10,d.tAll,d.coverage,d.recovery].map(quote).join(','))].join('\n');
  const link = document.createElement('a'); link.href = URL.createObjectURL(new Blob([csv], {type:'text/csv'})); link.download = 'mrcti-national-utility-selection.csv'; link.click(); URL.revokeObjectURL(link.href);
});

window.addEventListener('resize', () => { if ($('#screenView').classList.contains('active')) { renderMap(currentRows()); renderHistogram(currentRows()); } });

function rewindForD3(geo) {
  geo.features.forEach(feature => {
    const geometry = feature.geometry;
    if (geometry.type === 'Polygon') geometry.coordinates.forEach(ring => ring.reverse());
    if (geometry.type === 'MultiPolygon') geometry.coordinates.forEach(polygon => polygon.forEach(ring => ring.reverse()));
  });
  return geo;
}

function renderCoreModels() {
  const value = v => finite(v) ? Number(v).toFixed(3) : '&mdash;';
  const coreOrder = {'av-water-charge': 0, '10y-health-vio': 1};
  const layerOrder = {EMMA: 0, Public: 1, Private: 2};
  const outcomeLabel = {'av-water-charge': 'Average annual charge', '10y-health-vio': '10-year health violations'};
  const rows = MODELS
    .filter(d => d.layer !== 'Combined' && Object.hasOwn(coreOrder, d.outcome))
    .sort((a, b) => coreOrder[a.outcome] - coreOrder[b.outcome] || layerOrder[a.layer] - layerOrder[b.layer]);
  $('#coreModelBody').innerHTML = rows.map(d => `<tr><td>${outcomeLabel[d.outcome]}</td><td>${d.layer}</td><td class="num">${finite(d.n) ? fmt.format(d.n) : '&mdash;'}</td><td class="num">${finite(d.features) ? fmt.format(d.features) : '&mdash;'}</td><td class="num">${value(d.cvR2)}</td><td class="num">${value(d.cvRmse)}</td><td class="num">${value(d.cvMae)}</td></tr>`).join('');
}

renderModels();
renderCoreModels();
render();
if (window.MRCTI_STATES) {
  stateGeo = rewindForD3(window.MRCTI_STATES);
  renderMap(currentRows());
} else {
  d3.json('states.geojson?v=20260806-4').then(geo => { stateGeo = rewindForD3(geo); renderMap(currentRows()); }).catch(() => { $('#mapWrap').innerHTML = '<p class="figure-note">State geometry could not be loaded.</p>'; });
}
