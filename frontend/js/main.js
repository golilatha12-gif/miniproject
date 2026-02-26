document.addEventListener("DOMContentLoaded", () => {
  // Active nav link
  const links = document.querySelectorAll(".nav-links a");
  const path = window.location.pathname.split("/").pop();

  links.forEach(link => {
    if (link.getAttribute("href") === path) {
      link.classList.add("active");
    }
  });

  // Mobile menu toggle
  const menuBtn = document.getElementById("menuToggle");
  const mobileMenu = document.getElementById("mobileMenu");

  if (menuBtn && mobileMenu) {
    menuBtn.addEventListener("click", () => {
      mobileMenu.classList.toggle("hidden");
    });
  }
  
  // Sidebar toggle (reusable for pages with a left sidebar)
  // Uses existing .sidebar and .sidebar.show CSS; keeps logic small and non-invasive
  const openSidebarBtn = document.getElementById('openSidebar');
  const closeSidebarBtn = document.getElementById('closeSidebar');
  const sidebar = document.getElementById('sidebar');

  if (sidebar && openSidebarBtn) {
    const toggleMenu = (e) => {
      e && e.preventDefault();
      sidebar.classList.toggle('show');
    };

    openSidebarBtn.addEventListener('click', toggleMenu);
    if (closeSidebarBtn) closeSidebarBtn.addEventListener('click', toggleMenu);

    // Close when clicking outside the sidebar (non-invasive)
    document.addEventListener('click', (ev) => {
      if (!sidebar.classList.contains('show')) return;
      const target = ev.target;
      if (sidebar.contains(target) || (openSidebarBtn && openSidebarBtn.contains(target))) return;
      sidebar.classList.remove('show');
    });
  }
    
  // Load dynamic stats (calls backend /stats)
  async function loadStats() {
    const statEls = document.querySelectorAll('.stats .stats-grid h2');
    if (!statEls || statEls.length === 0) return;
    
    // Set placeholders
    statEls.forEach(h => h.textContent = '--');
    
    try {
      const res = await fetch('http://localhost:8000/stats', { cache: 'no-store' });
      if (!res.ok) throw new Error('Network response was not ok');
      const data = await res.json();
    
      const { total_scans, accuracy, total_diseases, total_users } = data || {};
    
      const values = [
        (typeof total_scans === 'number') ? formatNumber(total_scans) : '--',
        (typeof accuracy === 'number') ? `${accuracy}%` : '--',
        (typeof total_diseases === 'number') ? String(total_diseases) : '--',
        (typeof total_users === 'number') ? formatNumber(total_users) : '--'
      ];
    
      statEls.forEach((h, i) => { h.textContent = values[i]; });
    } catch (err) {
      // API failed — keep UI stable and show placeholders
      console.error('Failed to load stats:', err);
      statEls.forEach(h => h.textContent = '--');
    }
    
    function formatNumber(n) {
      try {
        if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
        if (n >= 1000) return n.toLocaleString();
        return String(n);
      } catch (e) {
        return String(n);
      }
    }
  }
    
  // Only run on pages that have the stats section
  if (document.querySelector('.stats')) {
    loadStats();
  }
});
