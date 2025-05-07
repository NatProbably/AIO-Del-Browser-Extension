// ==== LOGIN FUNCTIONS ====

/**
 * Login dengan metode tab (paling reliable)
 * @param {string} username - Username CIS
 * @param {string} password - Password CIS
 * @returns {Promise<boolean>} Status keberhasilan login
 */
async function loginWithTabMethod(username, password) {
  return new Promise((resolve) => {
    chrome.tabs.create({ 
      url: 'https://cis.del.ac.id/user/login', 
      active: false 
    }, async (tab) => {
      try {
        console.log("Tab dibuat, menunggu halaman dimuat...");

        // Tunggu halaman dimuat
        await new Promise(r => setTimeout(r, 3000));

        // Inject script untuk mengisi form
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          function: injectLoginForm,
          args: [{ username, password }]
        }, (results) => {
          if (!results || !results[0].result) {
            console.error("Gagal mengisi form login");
            chrome.tabs.remove(tab.id);
            resolve(false);
            return;
          }

          console.log("Form disubmit, menunggu proses login...");

          // Tunggu proses login (5 detik)
          setTimeout(() => {
            chrome.tabs.get(tab.id, (tabInfo) => {
              const success = tabInfo.url.includes('/dashboard');
              console.log(`Login ${success ? 'berhasil' : 'gagal'}, URL: ${tabInfo.url}`);

              if (success) {
                saveLoginState(username);
              }

              chrome.tabs.remove(tab.id);
              resolve(success);
            });
          }, 5000);
        });
      } catch (error) {
        console.error("Error login via tab:", error);
        chrome.tabs.remove(tab.id);
        resolve(false);
      }
    });
  });
}

/**
 * Fungsi yang diinject ke tab untuk mengisi form login
 * @param {Object} credentials - Username dan password
 * @returns {boolean} Status keberhasilan pengisian form
 */
function injectLoginForm(credentials) {
  console.log("Script diinject, mengisi form login...");

  // Cari elemen form
  const usernameField = document.querySelector('input[name="LoginForm[username]"]');
  const passwordField = document.querySelector('input[name="LoginForm[password]"]');
  const rememberMeField = document.querySelector('input[name="LoginForm[rememberMe]"]');
  const form = document.querySelector('form');

  console.log("Elemen form:", { 
    usernameField: !!usernameField, 
    passwordField: !!passwordField,
    form: !!form
  });

  if (!usernameField || !passwordField || !form) {
    console.error("Elemen form login tidak ditemukan!");
    return false;
  }

  // Isi form
  usernameField.value = credentials.username;
  passwordField.value = credentials.password;
  if (rememberMeField) rememberMeField.checked = true;

  // Submit form
  console.log("Mengirim form...");
  form.submit();
  return true;
}

/**
 * Login dengan fetch API (cadangan, kurang reliable)
 * @param {string} username - Username CIS
 * @param {string} password - Password CIS
 * @returns {Promise<boolean>} Status keberhasilan login
 */
async function loginWithFetch(username, password) {
  try {
    console.log('Memulai login via fetch untuk user:', username);

    // Ambil CSRF token
    const loginPage = await fetch('https://cis.del.ac.id/user/login', {
      method: 'GET',
      credentials: 'include',
      headers: getStandardHeaders()
    });

    console.log('Status response halaman login:', loginPage.status);
    const loginHtml = await loginPage.text();

    // Parse CSRF token
    const csrfTokenMatch = loginHtml.match(/<input type="hidden" name="_csrf" value="([^"]+)">/);
    if (!csrfTokenMatch) {
      console.error('CSRF token tidak ditemukan');
      return false;
    }
    const csrfToken = csrfTokenMatch[1];
    console.log('CSRF token didapat:', csrfToken);

    // Buat form data
    const formData = new URLSearchParams();
    formData.append('_csrf', csrfToken);
    formData.append('LoginForm[username]', username);
    formData.append('LoginForm[password]', password);
    formData.append('LoginForm[rememberMe]', '0');

    console.log('Form data disiapkan, mencoba login...');

    // Kirim request login
    const loginResponse = await fetch('https://cis.del.ac.id/user/login', {
      method: 'POST',
      body: formData,
      credentials: 'include',
      redirect: 'follow',
      headers: {
        ...getStandardHeaders(),
        'Content-Type': 'application/x-www-form-urlencoded',
        'Origin': 'https://cis.del.ac.id',
        'Referer': 'https://cis.del.ac.id/user/login'
      }
    });

    console.log('URL response login:', loginResponse.url);
    console.log('Status response login:', loginResponse.status);

    // Cek hasil login
    const isSuccess = loginResponse.url.includes('/dashboard');
    console.log('Login berhasil?', isSuccess);

    if (isSuccess) {
      saveLoginState(username);
    }

    return isSuccess;
  } catch (error) {
    console.error('Error login via fetch:', error);
    return false;
  }
}

/**
 * Cek status login dengan cookies
 * @returns {Promise<boolean>} Status login saat ini
 */
async function checkLoginWithCookies() {
  try {
    const response = await fetch('https://cis.del.ac.id/dashboard/default/index', {
      method: 'GET',
      credentials: 'include'
    });

    const isLoggedIn = !response.url.includes('/user/login');
    console.log("Cek login via cookies:", isLoggedIn ? "Sudah login" : "Belum login");

    if (isLoggedIn) {
      chrome.storage.local.set({ 
        lastLogin: Date.now(),
        isLoggedIn: true
      });
    }

    return isLoggedIn;
  } catch (error) {
    console.error("Error cek login via cookies:", error);
    return false;
  }
}

/**
 * Simpan status login
 * @param {string} username - Username yang berhasil login
 */
function saveLoginState(username) {
  chrome.storage.local.set({ 
    lastLogin: Date.now(),
    isLoggedIn: true,
    username: username
  });
}

/**
 * Dapatkan standard headers untuk request
 * @returns {Object} Headers untuk HTTP request
 */
function getStandardHeaders() {
  return {
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/135.0.0.0 Safari/537.36',
    'Accept-Language': 'en-US,en;q=0.9,id;q=0.8',
    'Cache-Control': 'max-age=0',
    'Upgrade-Insecure-Requests': '1'
  };
}

// ==== ANNOUNCEMENT FUNCTIONS ====
// ==== LOGIN FUNCTIONS ====
// [fungsi login tidak diubah, tetap seperti aslinya]

// ==== ANNOUNCEMENT FUNCTIONS ====

/**
 * Ambil pengumuman dari CIS
 * @returns {Promise<Object>} Hasil pengambilan pengumuman
 */
async function fetchAnnouncements() {
  try {
    console.log('Mengambil pengumuman...');

    // Cek login dulu
    const isLoggedIn = await checkLoginWithCookies();
    if (!isLoggedIn) {
      console.log('Belum login, tidak bisa ambil pengumuman');
      return { success: false, error: 'Belum login', announcements: [] };
    }

    // Ambil halaman pengumuman
    const response = await fetch('https://cis.del.ac.id/tmbh/pengumuman/pengumuman-browse', {
      method: 'GET',
      credentials: 'include'
    });

    // Cek redirect ke login
    if (response.url.includes('/user/login')) {
      console.log('Sesi berakhir, diarahkan ke login');
      return { success: false, error: 'Sesi berakhir', announcements: [] };
    }

    const html = await response.text();
    console.log('HTML halaman pengumuman diambil');

    // Simpan HTML untuk debug (opsional)
    chrome.storage.local.set({ debugHtml: html.substring(0, 50000) });

    // Parse HTML untuk ekstrak pengumuman
    const announcements = parseAnnouncementsFromHtml(html);

    // Jika tidak menemukan pengumuman dengan fetch, coba dengan tab method
    if (announcements.length === 0) {
      console.log('Tidak menemukan pengumuman dengan fetch, mencoba dengan tab method...');
      return await fetchAnnouncementsWithTab();
    }

    // Simpan ke storage
    chrome.storage.local.set({ 
      announcements: announcements,
      lastAnnouncementFetch: Date.now()
    });

    return { 
      success: true, 
      announcements: announcements,
      directUrl: 'https://cis.del.ac.id/tmbh/pengumuman/pengumuman-browse'
    };
  } catch (error) {
    console.error('Error ambil pengumuman:', error);
    // Jika gagal dengan fetch, coba dengan tab method
    console.log('Error dengan metode fetch, mencoba dengan tab method...');
    return await fetchAnnouncementsWithTab();
  }
}

/**
 * Ambil pengumuman langsung dari halaman CIS menggunakan tab
 * @returns {Promise<Object>} Hasil pengambilan pengumuman
 */
function fetchAnnouncementsWithTab() {
  return new Promise((resolve) => {
    // Buka tab untuk mengambil pengumuman
    chrome.tabs.create({ 
      url: 'https://cis.del.ac.id/tmbh/pengumuman/pengumuman-browse', 
      active: false 
    }, async (tab) => {
      try {
        console.log("Tab pengumuman dibuat, menunggu halaman dimuat...");

        // Tunggu halaman dimuat
        await new Promise(r => setTimeout(r, 5000));

        // Inject script untuk mengambil pengumuman
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          function: extractAnnouncementsFromPage
        }, (results) => {
          try {
            chrome.tabs.remove(tab.id);

            if (!results || !results[0]?.result) {
              console.error("Gagal mengambil pengumuman dari tab");
              resolve({ 
                success: false, 
                announcements: [], 
                directUrl: 'https://cis.del.ac.id/tmbh/pengumuman/pengumuman-browse' 
              });
              return;
            }

            const { announcements, pageTitle } = results[0].result;
            console.log(`Berhasil mengambil ${announcements.length} pengumuman dari tab`);
            console.log('Judul halaman:', pageTitle);

            // Simpan pengumuman ke storage
            chrome.storage.local.set({ 
              announcements: announcements,
              lastAnnouncementFetch: Date.now()
            });

            resolve({ 
              success: true, 
              announcements: announcements,
              directUrl: 'https://cis.del.ac.id/tmbh/pengumuman/pengumuman-browse'
            });
          } catch (error) {
            console.error('Error dalam callback tab:', error);
            resolve({ 
              success: false, 
              announcements: [], 
              directUrl: 'https://cis.del.ac.id/tmbh/pengumuman/pengumuman-browse' 
            });
          }
        });
      } catch (error) {
        console.error("Error mengambil pengumuman dengan tab:", error);
        chrome.tabs.remove(tab.id);
        resolve({ 
          success: false, 
          announcements: [], 
          directUrl: 'https://cis.del.ac.id/tmbh/pengumuman/pengumuman-browse' 
        });
      }
    });
  });
}

/**
 * Fungsi yang dieksekusi di halaman CIS untuk ekstrak pengumuman
 * @returns {Object} Daftar pengumuman dan informasi halaman
 */
function extractAnnouncementsFromPage() {
  const announcements = [];

  // Log judul untuk debugging
  console.log("Mengekstrak pengumuman dari halaman:", document.title);

  // ==== STRATEGI 1: Tabel standar di grid-view ====
  const gridView = document.querySelector('.grid-view');
  if (gridView) {
    const table = gridView.querySelector('table.items');
    if (table) {
      const rows = table.querySelectorAll('tbody tr');
      if (rows.length > 0) {
        console.log(`Strategi 1: Ditemukan ${rows.length} baris pengumuman`);

        for (let i = 0; i < rows.length; i++) {
          try {
            const row = rows[i];
            const cells = row.querySelectorAll('td');

            if (cells.length < 2) continue;

            const id = cells[0]?.textContent?.trim() || i.toString();
            const titleCell = cells[1];
            const titleLink = titleCell.querySelector('a');
            const title = titleLink ? titleLink.textContent.trim() : titleCell.textContent.trim();
            const link = titleLink ? titleLink.href : null;
            const date = cells[2]?.textContent?.trim() || '';
            const sender = cells.length > 3 ? cells[3].textContent.trim() : '';

            announcements.push({
              id,
              title,
              date,
              sender,
              link,
              read: false
            });
          } catch (error) {
            console.error('Error parsing row:', error);
          }
        }

        // Jika strategi 1 berhasil, return
        if (announcements.length > 0) {
          return { announcements, pageTitle: document.title };
        }
      }
    }
  }

  // ==== STRATEGI 2: Cari semua tabel di halaman ====
  const tables = document.querySelectorAll('table');
  for (let i = 0; i < tables.length; i++) {
    const table = tables[i];
    // Tabel pengumuman biasanya memiliki class 'items' atau header
    if (table.className.includes('items') || table.querySelector('th')) {
      const rows = table.querySelectorAll('tbody tr');
      if (rows.length > 0) {
        console.log(`Strategi 2: Ditemukan ${rows.length} baris di tabel #${i+1}`);

        for (let j = 0; j < rows.length; j++) {
          try {
            const row = rows[j];
            const cells = row.querySelectorAll('td');

            // Skip jika hanya 1 sel atau kurang (mungkin header)
            if (cells.length < 2) continue;

            const id = j.toString();
            const titleCell = cells[0];
            const titleLink = titleCell.querySelector('a');
            const title = titleLink ? titleLink.textContent.trim() : titleCell.textContent.trim();
            const link = titleLink ? titleLink.href : null;

            announcements.push({
              id,
              title,
              date: cells[1]?.textContent?.trim() || '',
              sender: cells[2]?.textContent?.trim() || '',
              link,
              read: false
            });
          } catch (error) {
            console.error('Error parsing row in table:', error);
          }
        }

        // Jika strategi 2 berhasil untuk tabel ini, return
        if (announcements.length > 0) {
          return { announcements, pageTitle: document.title };
        }
      }
    }
  }

  // ==== STRATEGI 3: Coba notifikasi ====
  const notifications = document.querySelectorAll('.dropdown-menu .menu li');
  if (notifications.length > 0) {
    console.log(`Strategi 3: Ditemukan ${notifications.length} notifikasi`);

    for (let i = 0; i < notifications.length; i++) {
      try {
        const notification = notifications[i];
        const notifDiv = notification.querySelector('.notif');
        if (!notifDiv) continue;

        const title = notifDiv.textContent.trim();
        const isRead = notification.classList.contains('info-read');
        const id = notification.querySelector('[notif-id]')?.getAttribute('notif-id') || i.toString();

        announcements.push({
          id,
          title,
          date: '',
          sender: 'Sistem',
          link: null,
          read: isRead
        });
      } catch (error) {
        console.error('Error parsing notification:', error);
      }
    }

    // Jika strategi 3 berhasil, return
    if (announcements.length > 0) {
      return { announcements, pageTitle: document.title };
    }
  }

  // ==== STRATEGI 4: Cari div dengan class/id pengumuman ====
  const pengumumanEls = document.querySelectorAll('[class*="pengumuman"], [id*="pengumuman"]');
  for (const pengumumanEl of pengumumanEls) {
    const links = pengumumanEl.querySelectorAll('a');
    if (links.length > 0) {
      console.log(`Strategi 4: Ditemukan ${links.length} link di kontainer pengumuman`);

      for (let i = 0; i < links.length; i++) {
        try {
          const link = links[i];

          announcements.push({
            id: i.toString(),
            title: link.textContent.trim(),
            date: '',
            sender: '',
            link: link.href,
            read: false
          });
        } catch (error) {
          console.error('Error parsing link:', error);
        }
      }

      // Jika strategi 4 berhasil, return
      if (announcements.length > 0) {
        return { announcements, pageTitle: document.title };
      }
    }
  }

  // ==== STRATEGI 5: Ambil semua link dari content wrapper ====
  const contentWrapper = document.querySelector('.content-wrapper');
  if (contentWrapper) {
    const links = contentWrapper.querySelectorAll('a');
    if (links.length > 0) {
      console.log(`Strategi 5: Ditemukan ${links.length} link di content wrapper`);

      for (let i = 0; i < links.length; i++) {
        try {
          const link = links[i];
          // Filter link yang mungkin pengumuman (tidak termasuk menu, link ke profile, dll)
          if (!link.closest('.main-header') && !link.closest('.main-sidebar') && 
              !link.href.includes('/user/') && !link.href.includes('/dashboard/')) {

            announcements.push({
              id: i.toString(),
              title: link.textContent.trim(),
              date: '',
              sender: '',
              link: link.href,
              read: false
            });
          }
        } catch (error) {
          console.error('Error parsing content wrapper link:', error);
        }
      }

      // Jika strategi 5 berhasil, return
      if (announcements.length > 0) {
        return { announcements, pageTitle: document.title };
      }
    }
  }

  // Jika semua strategi gagal
  console.log('Semua strategi ekstraksi gagal, tidak dapat menemukan pengumuman');
  return { announcements: [], pageTitle: document.title };
}

/**
 * Parse HTML pengumuman dengan multi-strategi
 * @param {string} html - HTML halaman pengumuman
 * @returns {Array} Daftar pengumuman
 */
function parseAnnouncementsFromHtml(html) {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    console.log('Parsing pengumuman dari HTML...');
    console.log('Judul halaman:', doc.title);

    // ==== STRATEGI 1: Format standar - Tabel di pengumuman-browse ====
    const gridView = doc.querySelector('.pengumuman-browse');
    if (gridView) {
      const table = gridView.querySelector('table');
      if (table) {
        const rows = table.querySelectorAll('tbody tr');
        if (rows.length > 0) {
          console.log(`Strategi 1: Ditemukan ${rows.length} baris pengumuman`);
          return extractFromGridView(rows);
        }
      }
    }

    // ==== STRATEGI 2: Cari tabel dengan class 'items' ====
    const itemsTables = doc.querySelectorAll('table.items');
    for (const table of itemsTables) {
      const rows = table.querySelectorAll('tbody tr');
      if (rows.length > 0) {
        console.log(`Strategi 2: Ditemukan ${rows.length} baris di tabel items`);
        return extractFromGridView(rows);
      }
    }

    // ==== STRATEGI 3: Cari semua tabel yang mungkin berisi pengumuman ====
    const allTables = doc.querySelectorAll('table');
    for (let i = 0; i < allTables.length; i++) {
      const table = allTables[i];
      // Cek jika tabel memiliki baris dan sel yang cukup
      const rows = table.querySelectorAll('tbody tr');
      if (rows.length > 1) { // Minimal 2 baris (header + 1 data)
        const firstRow = rows[0];
        const cells = firstRow.querySelectorAll('td, th');
        if (cells.length >= 2) { // Minimal 2 kolom (id + title)
          console.log(`Strategi 3: Ditemukan tabel potensial #${i+1} dengan ${rows.length} baris`);
          return extractFromGenericTable(rows);
        }
      }
    }

    // ==== STRATEGI 4: Cari notifikasi ====
    const notifications = doc.querySelectorAll('.dropdown-menu .menu li');
    if (notifications.length > 0) {
      console.log(`Strategi 4: Ditemukan ${notifications.length} notifikasi`);
      return extractFromNotifications(notifications);
    }

    // ==== STRATEGI 5: Cari div pengumuman ====
    const pengumumanContainers = doc.querySelectorAll('[class*="pengumuman"], [id*="pengumuman"]');
    for (const container of pengumumanContainers) {
      const links = container.querySelectorAll('a');
      if (links.length > 0) {
        console.log(`Strategi 5: Ditemukan ${links.length} link dalam elemen pengumuman`);
        return extractFromLinks(links);
      }
    }

    console.log('Semua strategi parsing gagal, tidak dapat menemukan pengumuman');
    return [];
  } catch (error) {
    console.error('Error parsing pengumuman:', error);
    return [];
  }
}

/**
 * Ekstrak pengumuman dari GridView
 * @param {NodeList} rows - Baris tabel pengumuman
 * @returns {Array} Daftar pengumuman
 */
function extractFromGridView(rows) {
  const announcements = [];

  for (let i = 0; i < rows.length; i++) {
    try {
      const row = rows[i];

      // Skip baris header
      if (row.querySelector('th')) continue;

      const cells = row.querySelectorAll('td');
      if (cells.length < 2) continue;

      const id = cells[0]?.textContent?.trim() || i.toString();

      const titleCell = cells[1] || cells[0];
      const titleLink = titleCell.querySelector('a');
      const title = titleLink ? titleLink.textContent.trim() : titleCell.textContent.trim();
      const link = titleLink ? titleLink.href : null;

      const date = cells[2]?.textContent?.trim() || '';
      const sender = cells.length > 3 ? cells[3].textContent.trim() : '';

      announcements.push({
        id,
        title,
        date,
        sender,
        link,
        read: false
      });
    } catch (error) {
      console.error('Error extracting from GridView:', error);
    }
  }

  return announcements;
}

/**
 * Ekstrak pengumuman dari tabel generik
 * @param {NodeList} rows - Baris tabel generik
 * @returns {Array} Daftar pengumuman
 */
function extractFromGenericTable(rows) {
  const announcements = [];
  let hasHeader = false;

  // Cek apakah baris pertama adalah header
  const firstRow = rows[0];
  if (firstRow.querySelector('th') || firstRow.tagName.toLowerCase() === 'th') {
    hasHeader = true;
  }

  // Mulai dari baris kedua jika ada header
  const startIndex = hasHeader ? 1 : 0;

  for (let i = startIndex; i < rows.length; i++) {
    try {
      const row = rows[i];
      const cells = row.querySelectorAll('td');

      if (cells.length < 1) continue;

      // Tentukan sel yang kemungkinan berisi judul
      let titleCell, dateCell, senderCell;

      if (cells.length >= 3) {
        // Format umum: ID | Judul | Tanggal | Pengirim
        titleCell = cells[1];
        dateCell = cells[2];
        senderCell = cells[3];
      } else if (cells.length === 2) {
        // Format minimal: Judul | Tanggal
        titleCell = cells[0];
        dateCell = cells[1];
      } else {
        // Hanya 1 sel: asumsikan judul
        titleCell = cells[0];
      }

      // Ekstrak data
      const titleLink = titleCell.querySelector('a');
      const title = titleLink ? titleLink.textContent.trim() : titleCell.textContent.trim();
      const link = titleLink ? titleLink.href : null;
      const date = dateCell ? dateCell.textContent.trim() : '';
      const sender = senderCell ? senderCell.textContent.trim() : '';

      announcements.push({
        id: i.toString(),
        title,
        date,
        sender,
        link,
        read: false
      });
    } catch (error) {
      console.error('Error extracting from generic table:', error);
    }
  }

  return announcements;
}

/**
 * Ekstrak pengumuman dari notifikasi
 * @param {NodeList} notifications - Elemen notifikasi
 * @returns {Array} Daftar pengumuman
 */
function extractFromNotifications(notifications) {
  const announcements = [];

  for (let i = 0; i < notifications.length; i++) {
    try {
      const notification = notifications[i];
      const notifDiv = notification.querySelector('.notif');
      if (!notifDiv) continue;

      const title = notifDiv.textContent.trim();
      const isRead = notification.classList.contains('info-read');
      const id = notification.querySelector('[notif-id]')?.getAttribute('notif-id') || i.toString();
      const notifMarkRead = notification.querySelector('.notif-tools-markread');
      const link = notifMarkRead ? notifMarkRead.getAttribute('goto') : null;

      announcements.push({
        id,
        title,
        date: '',
        sender: 'Sistem',
        link,
        read: isRead
      });
    } catch (error) {
      console.error('Error extracting from notifications:', error);
    }
  }

  return announcements;
}

/**
 * Ekstrak pengumuman dari daftar link
 * @param {NodeList} links - Elemen link
 * @returns {Array} Daftar pengumuman
 */
function extractFromLinks(links) {
  const announcements = [];

  for (let i = 0; i < links.length; i++) {
    try {
      const link = links[i];
      const title = link.textContent.trim();

      // Filter link yang berpotensi sebagai pengumuman (bukan link navigasi)
      if (title && 
          !title.match(/^(home|login|logout|profile|dashboard)$/i) &&
          !link.closest('header') && 
          !link.closest('nav') && 
          !link.closest('.sidebar')) {

        announcements.push({
          id: i.toString(),
          title,
          date: '',
          sender: '',
          link: link.href,
          read: false
        });
      }
    } catch (error) {
      console.error('Error extracting from links:', error);
    }
  }

  return announcements;
}

/**
 * Bersihkan karakter encoding yang tidak benar
 * @param {string} text - Teks yang akan dibersihkan
 * @returns {string} Teks yang sudah dibersihkan
 */
function cleanEncodingIssues(text) {
  if (!text) return '';

  // Perbaiki encoding untuk karakter umum yang sering bermasalah
  return text
    .replace(/â€¢/g, '•')    // Bullet point
    .replace(/â€"/g, '—')    // Em dash
    .replace(/â€"/g, '–')    // En dash
    .replace(/â€œ/g, '"')    // Double quote kiri
    .replace(/â€/g, '"')     // Double quote kanan
    .replace(/Â /g, ' ')     // Non-breaking space
    .replace(/â€‹/g, '')     // Zero width space
    .replace(/&amp;/g, '&')  // Ampersand
    .replace(/&lt;/g, '<')   // Less than
    .replace(/&gt;/g, '>')   // Greater than
    .trim();
}


// ==== SCHEDULED TASKS ====

/**
 * Cek pengumuman secara berkala
 */
async function checkAnnouncements() {
  try {
    // Cek login dulu
    const isLoggedIn = await checkLoginWithCookies();

    if (!isLoggedIn) {
      // Login jika perlu
      const loginData = await chrome.storage.local.get(['username', 'password']);
      if (!loginData.username || !loginData.password) {
        console.log('Tidak dapat cek pengumuman: kredensial tidak ada');
        return false;
      }

      const loginSuccess = await loginWithTabMethod(loginData.username, loginData.password);
      if (!loginSuccess) {
        console.log('Gagal login, tidak dapat cek pengumuman');
        return false;
      }
    }

    // Ambil pengumuman
    const result = await fetchAnnouncements();
    if (result.success && result.announcements.length > 0) {
      // Tampilkan notifikasi jika ada pengumuman baru
      showNewAnnouncementsNotification(result.announcements);
    }

    console.log('Berhasil cek pengumuman');
    return true;
  } catch (error) {
    console.error('Error cek pengumuman:', error);
    return false;
  }
}

/**
 * Tampilkan notifikasi untuk pengumuman baru
 * @param {Array} announcements - Daftar pengumuman
 */
function showNewAnnouncementsNotification(announcements) {
  // Dapatkan pengumuman tersimpan untuk dibandingkan
  chrome.storage.local.get(['lastNotifiedAnnouncements'], function(data) {
    const lastAnnouncements = data.lastNotifiedAnnouncements || [];

    // Cari pengumuman baru (yang belum ada di daftar sebelumnya)
    const lastIds = new Set(lastAnnouncements.map(a => a.id));
    const newAnnouncements = announcements.filter(a => !lastIds.has(a.id));

    if (newAnnouncements.length > 0) {
      // Tampilkan notifikasi
      chrome.notifications.create({
        type: 'basic',
        iconUrl: '/icon128.png',
        title: 'Pengumuman CIS Baru',
        message: `Ada ${newAnnouncements.length} pengumuman baru dari CIS. Klik untuk melihat.`,
        priority: 2
      });

      // Simpan daftar terbaru untuk perbandingan selanjutnya
      chrome.storage.local.set({ lastNotifiedAnnouncements: announcements });
    }
  });
}

// ==== EVENT LISTENERS ====

// Set up alarm untuk cek berkala (setiap 15 menit)
chrome.alarms.create('checkCIS', { periodInMinutes: 15 });

// Listener untuk alarm
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'checkCIS') {
    checkAnnouncements();
  }
});

// Listener untuk klik notifikasi
chrome.notifications.onClicked.addListener(() => {
  chrome.tabs.create({ url: 'https://cis.del.ac.id/tmbh/pengumuman/pengumuman-browse' });
});

// Listener untuk pesan dari popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Handler login
  if (message.action === 'login') {
    const { username, password } = message;

    chrome.storage.local.set({ username, password }, async () => {
      const success = await loginWithTabMethod(username, password);

      if (!success) {
        console.log('Login gagal dengan tab method, mencoba dengan fetch...');
        const fetchSuccess = await loginWithFetch(username, password);
        sendResponse({ success: fetchSuccess });
      } else {
        sendResponse({ success });
      }
    });

    return true; // Akan merespon secara asynchronous
  }

  // Handler cek login
  if (message.action === 'checkLogin') {
    checkLoginWithCookies().then(isLoggedIn => {
      sendResponse({ isLoggedIn });
    });
    return true; // Akan merespon secara asynchronous
  }

  // Handler login manual
  if (message.action === 'manualLogin') {
    chrome.tabs.create({ url: 'https://cis.del.ac.id/user/login', active: true });
    sendResponse({ success: true });
  }

  // Handler ambil pengumuman
  if (message.action === 'fetchAnnouncements') {
    fetchAnnouncements().then(result => {
      sendResponse(result);
    });
    return true; // Akan merespon secara asynchronous
  }

  // Debugging - buka halaman pengumuman di tab baru
  if (message.action === 'openAnnouncementsPage') {
    chrome.tabs.create({ url: 'https://cis.del.ac.id/tmbh/pengumuman/pengumuman-browse' });
    sendResponse({ success: true });
  }
});
