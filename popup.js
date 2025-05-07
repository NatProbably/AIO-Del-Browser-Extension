document.addEventListener('DOMContentLoaded', function() {
  // Tab navigation
  setupTabs();

  // Login functionality
  setupLoginForm();

  // Load initial content for active tab
  const activeTab = document.querySelector('.tab.active').getAttribute('data-tab');
  if (activeTab === 'announcements') {
    loadAnnouncements();
  }
});

// Tab navigation setup
function setupTabs() {
  const tabs = document.querySelectorAll('.tab');

  tabs.forEach(tab => {
    tab.addEventListener('click', function() {
      // Remove active class from all tabs
      tabs.forEach(t => t.classList.remove('active'));

      // Add active class to clicked tab
      this.classList.add('active');

      // Show corresponding content
      const tabId = this.getAttribute('data-tab');
      const tabContents = document.querySelectorAll('.tab-content');

      tabContents.forEach(content => {
        content.classList.remove('active');
      });

      document.getElementById(tabId + '-tab').classList.add('active');

      // Load content if needed
      if (tabId === 'announcements') {
        loadAnnouncements();
      }
    });
  });
}

// Login form setup
function setupLoginForm() {
  const loginBtn = document.getElementById('login-btn');
  const checkLoginBtn = document.getElementById('check-login-btn');
  const manualLoginBtn = document.getElementById('manual-login-btn');
  const usernameInput = document.getElementById('username');
  const passwordInput = document.getElementById('password');
  const loginStatus = document.getElementById('login-status');

  // Load saved username if any
  chrome.storage.local.get(['username', 'isLoggedIn'], function(data) {
    if (data.username) {
      usernameInput.value = data.username;
    }

    if (data.isLoggedIn) {
      loginStatus.textContent = 'Status: Anda sudah login';
      loginStatus.className = 'status success';
    }
  });

  // Login button
  loginBtn.addEventListener('click', function() {
    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();

    if (!username || !password) {
      loginStatus.textContent = 'Username dan password harus diisi!';
      loginStatus.className = 'status error';
      return;
    }

    loginStatus.textContent = 'Sedang login...';
    loginStatus.className = 'status info';
    loginBtn.disabled = true;

    chrome.runtime.sendMessage(
      { action: 'login', username, password },
      function(response) {
        loginBtn.disabled = false;

        if (response && response.success) {
          loginStatus.textContent = 'Login berhasil!';
          loginStatus.className = 'status success';
        } else {
          loginStatus.textContent = 'Login gagal. Periksa username dan password.';
          loginStatus.className = 'status error';
        }
      }
    );
  });

  // Check login status button
  checkLoginBtn.addEventListener('click', function() {
    loginStatus.textContent = 'Memeriksa status login...';
    loginStatus.className = 'status info';

    chrome.runtime.sendMessage({ action: 'checkLogin' }, function(response) {
      if (response && response.isLoggedIn) {
        loginStatus.textContent = 'Status: Anda sudah login';
        loginStatus.className = 'status success';
      } else {
        loginStatus.textContent = 'Status: Belum login';
        loginStatus.className = 'status error';
      }
    });
  });

  // Manual login button
  manualLoginBtn.addEventListener('click', function() {
    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();

    // Save credentials if entered
    if (username) {
      chrome.storage.local.set({ username });
    }

    chrome.runtime.sendMessage({ action: 'manualLogin' });
  });
}

// Load announcements
function loadAnnouncements(forceRefresh = false) {
  const announcementsList = document.getElementById('announcements-list');
  announcementsList.innerHTML = '<div class="loading">Memuat pengumuman...</div>';

  // Set up refresh button
  document.getElementById('refresh-announcements-btn').addEventListener('click', function() {
    loadAnnouncements(true);
  });

  // Check login status first
  chrome.runtime.sendMessage({ action: 'checkLogin' }, function(loginResponse) {
    if (!loginResponse || !loginResponse.isLoggedIn) {
      announcementsList.innerHTML = `
        <div class="no-items">
          Anda belum login. Silakan login terlebih dahulu.
          <button id="goto-login-tab" style="margin-top: 10px;">Go to Login</button>
        </div>
      `;

      document.getElementById('goto-login-tab').addEventListener('click', function() {
        // Switch to login tab
        document.querySelector('.tab[data-tab="login"]').click();
      });

      return;
    }

    // If not forcing refresh, try to get from cache first
    if (!forceRefresh) {
      chrome.storage.local.get(['announcements', 'lastAnnouncementFetch'], function(data) {
        if (data.announcements && data.lastAnnouncementFetch && 
            (Date.now() - data.lastAnnouncementFetch < 5 * 60 * 1000)) { // 5 minutes cache
          displayAnnouncements(data.announcements);
          return;
        }

        // No valid cache, fetch fresh data
        fetchAnnouncementsFromServer();
      });
    } else {
      // Force refresh requested, fetch fresh data
      fetchAnnouncementsFromServer();
    }
  });
}

// Fetch announcements from server
function fetchAnnouncementsFromServer() {
  chrome.runtime.sendMessage({ action: 'fetchAnnouncements' }, function(response) {
    if (response && response.success) {
      displayAnnouncements(response.announcements);
    } else {
      const announcementsList = document.getElementById('announcements-list');
      announcementsList.innerHTML = `
        <div class="no-items">
          Gagal mengambil pengumuman.<br>
          Error: ${response ? response.error : 'Unknown error'}
          <button id="open-announcements-page" style="margin-top: 10px;">Buka Halaman Pengumuman</button>
        </div>
      `;

      document.getElementById('open-announcements-page').addEventListener('click', function() {
        chrome.runtime.sendMessage({ action: 'openAnnouncementsPage' });
      });
    }
  });
}

// Fungsi untuk menampilkan pengumuman
function displayAnnouncements(announcements, directUrl) {
  const announcementsList = document.getElementById('announcements-list');

  if (!announcements || announcements.length === 0) {
    announcementsList.innerHTML = `
      <div class="no-items">
        <p>Tidak dapat menemukan pengumuman secara otomatis.</p>
        <button id="open-announcements-page" class="btn btn-primary">
          Lihat Pengumuman di CIS
        </button>
      </div>
    `;

    document.getElementById('open-announcements-page').addEventListener('click', function() {
      chrome.tabs.create({ url: directUrl || 'https://cis.del.ac.id/tmbh/pengumuman/pengumuman-browse' });
    });
    return;
  }

  // Clear previous content
  announcementsList.innerHTML = '';

  // Add each announcement
  announcements.forEach(announcement => {
    const item = document.createElement('div');
    item.className = 'announcement-item';
    item.dataset.id = announcement.id;

    const title = document.createElement('div');
    title.className = 'announcement-title';
    title.textContent = announcement.title;

    const meta = document.createElement('div');
    meta.className = 'announcement-meta';

    // Only add date and sender if they exist
    let metaText = '';
    if (announcement.date) metaText += announcement.date;
    if (announcement.sender) {
      if (metaText) metaText += ' • ';
      metaText += announcement.sender;
    }
    meta.textContent = metaText;

    item.appendChild(title);
    item.appendChild(meta);

    // Add click handler
    item.addEventListener('click', function() {
      if (announcement.link) {
        chrome.tabs.create({ url: announcement.link });
      } else {
        chrome.tabs.create({ url: directUrl || 'https://cis.del.ac.id/tmbh/pengumuman/pengumuman-browse' });
      }
    });

    announcementsList.appendChild(item);
  });

  // Add a "View All" button at the bottom
  const viewAllContainer = document.createElement('div');
  viewAllContainer.className = 'view-all-container';

  const viewAllButton = document.createElement('button');
  viewAllButton.id = 'view-all-announcements';
  viewAllButton.className = 'btn btn-secondary';
  viewAllButton.textContent = 'Lihat Semua di CIS';
  viewAllButton.addEventListener('click', function() {
    chrome.tabs.create({ url: directUrl || 'https://cis.del.ac.id/tmbh/pengumuman/pengumuman-browse' });
  });

  viewAllContainer.appendChild(viewAllButton);
  announcementsList.appendChild(viewAllContainer);
}

// Dalam fungsi loadAnnouncements
function loadAnnouncements(forceRefresh = false) {
  const announcementsList = document.getElementById('announcements-list');
  announcementsList.innerHTML = '<div class="loading">Memuat pengumuman...</div>';

  // Set up refresh button
  document.getElementById('refresh-announcements-btn').addEventListener('click', function() {
    loadAnnouncements(true);
  });

  // Implementasi lainnya seperti sebelumnya...

  // Saat menampilkan pengumuman, gunakan:
  chrome.runtime.sendMessage({ action: 'fetchAnnouncements' }, function(response) {
    if (response && response.success) {
      displayAnnouncements(response.announcements, response.directUrl);
    } else {
      // Tampilkan error dan link ke CIS
      displayAnnouncements([], response.directUrl);
    }
  });
}

