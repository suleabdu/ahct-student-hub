/* =============================================================================
   js/components.js
   AH Student Hub — shared sidebar / header / footer renderers

   Ported near verbatim from the original sidebar.html, header.html, and
   footer.html (Apps Script HTML includes) — these never called
   google.script.run themselves, so no API porting was needed, only the
   file format (an .html include -> a plain .js file loaded with <script
   src>).
   ============================================================================= */

// navItems: [{ id, label, icon }]. onSelect(id) is called when a nav item
// is clicked; the calling page owns what happens next (showing/hiding its
// own view sections) — this component only renders and highlights.
function renderSidebar(containerId, navItems, activeId, onSelect, footerLabel) {
  const container = document.getElementById(containerId);
  container.innerHTML = `
      <div class="flex items-center gap-3 px-6 py-6 border-b border-gray-200">
        <img src="https://lh3.googleusercontent.com/d/1Qp_nbC6oekgdzjJqGBHwHw125t1ABYUf" alt="AH Logo" class="h-9 w-auto object-contain">
        <span class="font-extrabold text-sm uppercase tracking-wide"><span class="text-black">AH</span> <span class="theme-accent">HUB</span></span>
      </div>
      <nav class="flex-1 px-3 py-4 space-y-1">
        ${navItems.map(item => `
          <button type="button" data-nav-id="${item.id}"
            class="sidebar-nav-item w-full text-left px-4 py-3 rounded-lg font-bold text-sm uppercase tracking-wide transition-colors flex items-center gap-3 ${item.id === activeId ? 'theme-bg-accent text-white' : 'text-gray-600 hover:bg-gray-100'}">
            <span>${item.icon || ''}</span> ${item.label}
          </button>
        `).join('')}
      </nav>
      ${footerLabel ? `<div class="px-6 py-4 border-t border-gray-200 text-xs text-gray-400">${footerLabel}</div>` : ''}
    `;
  container.querySelectorAll('.sidebar-nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.sidebar-nav-item').forEach(b => {
        b.classList.remove('theme-bg-accent', 'text-white');
        b.classList.add('text-gray-600');
      });
      btn.classList.remove('text-gray-600');
      btn.classList.add('theme-bg-accent', 'text-white');
      onSelect(btn.dataset.navId);
    });
  });
}

function renderHeader(containerId, title, userName, onLogout) {
  const container = document.getElementById(containerId);
  container.innerHTML = `
      <div class="flex items-center justify-between px-6 py-4 bg-white border-b border-gray-200 shadow-sm">
        <h1 class="text-lg md:text-xl font-black text-gray-900 uppercase tracking-wide">${title}</h1>
        <div class="flex items-center gap-4">
          <span class="text-sm text-gray-600 hidden sm:inline">Hi, <strong class="text-gray-900">${userName}</strong></span>
          <button type="button" id="headerLogoutBtn" class="text-sm theme-accent font-bold hover:underline">Log out</button>
        </div>
      </div>
    `;
  document.getElementById('headerLogoutBtn').addEventListener('click', onLogout);
}

function renderFooter(containerId) {
  const container = document.getElementById(containerId);
  container.innerHTML = `
      <div class="px-6 py-4 text-center text-xs text-gray-400 border-t border-gray-200 bg-white">
        &copy; ${new Date().getFullYear()} AH Consult Ltd — AH Student Hub
      </div>
    `;
}
