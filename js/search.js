/**
 * Diyaa — search page logic (extracted from search.html so it can run
 * under a strict Content-Security-Policy with no inline scripts).
 */
(function () {
  'use strict';

  const input = document.getElementById('search-input');
  const grid = document.getElementById('results-grid');
  const noResults = document.getElementById('no-results');
  const countLabel = document.getElementById('search-count');
  const tools = window.DiyaaToolsData || [];
  const escapeHtml = (window.Diyaa && window.Diyaa.Utils && window.Diyaa.Utils.escapeHtml)
    ? window.Diyaa.Utils.escapeHtml
    : (s) => String(s);

  function render(query) {
    const q = query.trim().toLowerCase();
    const matches = !q
      ? tools
      : tools.filter((t) =>
          t.name.toLowerCase().includes(q) ||
          t.desc.toLowerCase().includes(q) ||
          t.keywords.toLowerCase().includes(q)
        );

    grid.innerHTML = matches.map((t) => `
      <article class="tool-card" role="listitem">
        <div class="tool-card-icon">${t.icon}</div>
        <h3>${escapeHtml(t.name)}</h3>
        <p>${escapeHtml(t.desc)}</p>
        <a href="tools/${encodeURIComponent(t.slug)}.html" class="tool-card-link">Open tool →</a>
      </article>
    `).join('');

    noResults.style.display = matches.length ? 'none' : 'block';
    countLabel.textContent = q ? `${matches.length} result(s) for "${query.trim()}"` : `${tools.length} tools available`;
  }

  // Support access via the SearchAction link: /search.html?q=...
  const params = new URLSearchParams(location.search);
  const initialQuery = params.get('q') || '';
  input.value = initialQuery;
  render(initialQuery);

  input.addEventListener('input', () => render(input.value));

  const form = document.getElementById('search-form');
  if (form) form.addEventListener('submit', (e) => e.preventDefault());
})();
