/**
 * CIS DEL Helper Extension - Background Script
 * 
 * A Chrome extension to help students access CIS DEL more efficiently
 * Handles login, announcement fetching, and notifications.
 */

// ======================================================================
// CONSTANTS & CONFIG
// ======================================================================

const CONFIG = {
  urls: {
    login: 'https://cis.del.ac.id/user/login',
    dashboard: 'https://cis.del.ac.id/dashboard/default/index',
    announcements: 'https://cis.del.ac.id/tmbh/pengumuman/pengumuman-browse'
  },
  cache: {
    announcementExpiryMs: 5 * 60 * 1000, // 5 minutes
    checkIntervalMinutes: 15
  },
  debug: true // Set to false in production
};

// ======================================================================
// UTILITIES & HELPERS
// ======================================================================

/**
 * Custom logger with levels
 */
const Logger = {
  log: function(message, ...data) {
    if (CONFIG.debug) console.log(`[CIS Helper] ${message}`, ...data);
  },
  error: function(message, ...data) {
    if (CONFIG.debug) console.error(`[CIS Helper] ${message}`, ...data);
  },
  info: function(message, ...data) {
    if (CONFIG.debug) console.info(`[CIS Helper] ${message}`, ...data);
  },
  warn: function(message, ...data) {
    if (CONFIG.debug) console.warn(`[CIS Helper] ${message}`, ...data);
  }
};

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

/**
 * Bersihkan teks dari karakter yang tidak diinginkan
 * @param {string} text - Teks yang akan dibersihkan
 * @returns {string} Teks yang sudah dibersihkan
 */
function cleanText(text) {
  if (!text) return '';
  return text.replace(/\s+/g, ' ').trim();
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
    .replace(/â€"/g, '-')    // Em dash
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

/**
 * Simpan data ke storage lokal
 * @param {Object} data - Data yang akan disimpan
 * @returns {Promise} Promise yang menandakan keberhasilan
 */
function saveToStorage(data) {
  return new Promise((resolve) => {
    chrome.storage.local.set(data, () => {
      Logger.log('Data tersimpan', data);
      resolve(true);
    });
  });
}

/**
 * Ambil data dari storage lokal
 * @param {Array|string} keys - Keys yang akan diambil
 * @returns {Promise<Object>} Promise berisi data yang diminta
 */
function getFromStorage(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, (data) => {
      resolve(data);
    });
  });
}

/**
 * Delay function
 * @param {number} ms - Delay dalam milidetik
 * @returns {Promise} Promise yang resolve setelah delay
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ======================================================================
// LOGIN FUNCTIONS
// ======================================================================

/**
 * Simpan status login
 * @param {string} username - Username yang berhasil login
 * @returns {Promise} Promise menandakan keberhasilan
 */
async function saveLoginState(username) {
  return await saveToStorage({ 
    lastLogin: Date.now(),
    isLoggedIn: true,
    username: username
  });
}

/**
 * Login dengan metode tab (paling reliable)
 * @param {string} username - Username CIS
 * @param {string} password - Password CIS
 * @returns {Promise<boolean>} Status keberhasilan login
 */
async function loginWithTabMethod(username, password) {
  return new Promise((resolve) => {
    chrome.tabs.create({ 
      url: CONFIG.urls.login, 
      active: false 
    }, async (tab) => {
      try {
        Logger.log("Tab dibuat, menunggu halaman dimuat...");

        // Tunggu halaman dimuat
        await delay(3000);

        // Inject script untuk mengisi form
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          function: injectLoginForm,
          args: [{ username, password }]
        }, async (results) => {
          if (!results || !results[0].result) {
            Logger.error("Gagal mengisi form login");
            chrome.tabs.remove(tab.id);
            resolve(false);
            return;
          }

          Logger.log("Form disubmit, menunggu proses login...");

          // Tunggu proses login (5 detik)
          await delay(5000);
          
          try {
            const tabInfo = await new Promise((resolve, reject) => {
              chrome.tabs.get(tab.id, (tabInfo) => {
                if (chrome.runtime.lastError) {
                  reject(chrome.runtime.lastError);
                  return;
                }
                resolve(tabInfo);
              });
            });
            
            const success = tabInfo.url.includes('/dashboard');
            Logger.log(`Login ${success ? 'berhasil' : 'gagal'}, URL: ${tabInfo.url}`);

            if (success) {
              await saveLoginState(username);
            }

            chrome.tabs.remove(tab.id);
            resolve(success);
          } catch (error) {
            Logger.error("Error saat memeriksa tab:", error);
            chrome.tabs.remove(tab.id);
            resolve(false);
          }
        });
      } catch (error) {
        Logger.error("Error login via tab:", error);
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
    Logger.log('Memulai login via fetch untuk user:', username);

    // Ambil CSRF token
    const loginPage = await fetch(CONFIG.urls.login, {
      method: 'GET',
      credentials: 'include',
      headers: getStandardHeaders()
    });

    Logger.log('Status response halaman login:', loginPage.status);
    
    if (!loginPage.ok) {
      Logger.error('Gagal mengakses halaman login:', loginPage.status);
      return false;
    }
    
    const loginHtml = await loginPage.text();

    // Parse CSRF token
    const csrfTokenMatch = loginHtml.match(/<input type="hidden" name="_csrf" value="([^"]+)">/);
    if (!csrfTokenMatch) {
      Logger.error('CSRF token tidak ditemukan');
      return false;
    }
    const csrfToken = csrfTokenMatch[1];
    Logger.log('CSRF token didapat:', csrfToken);

    // Buat form data
    const formData = new URLSearchParams();
    formData.append('_csrf', csrfToken);
    formData.append('LoginForm[username]', username);
    formData.append('LoginForm[password]', password);
    formData.append('LoginForm[rememberMe]', '0');

    Logger.log('Form data disiapkan, mencoba login...');

    // Kirim request login
    const loginResponse = await fetch(CONFIG.urls.login, {
      method: 'POST',
      body: formData,
      credentials: 'include',
      redirect: 'follow',
      headers: {
        ...getStandardHeaders(),
        'Content-Type': 'application/x-www-form-urlencoded',
        'Origin': 'https://cis.del.ac.id',
        'Referer': CONFIG.urls.login
      }
    });

    Logger.log('URL response login:', loginResponse.url);
    Logger.log('Status response login:', loginResponse.status);

    // Cek hasil login
    const isSuccess = loginResponse.url.includes('/dashboard');
    Logger.log('Login berhasil?', isSuccess);

    if (isSuccess) {
      await saveLoginState(username);
    }

    return isSuccess;
  } catch (error) {
    Logger.error('Error login via fetch:', error);
    return false;
  }
}

/**
 * Cek status login dengan cookies
 * @returns {Promise<boolean>} Status login saat ini
 */
async function checkLoginWithCookies() {
  try {
    const response = await fetch(CONFIG.urls.dashboard, {
      method: 'GET',
      credentials: 'include',
      headers: getStandardHeaders()
    });

    const isLoggedIn = !response.url.includes('/user/login');
    Logger.log("Cek login via cookies:", isLoggedIn ? "Sudah login" : "Belum login");

    if (isLoggedIn) {
      await saveToStorage({ 
        lastLogin: Date.now(),
        isLoggedIn: true
      });
    } else {
      await saveToStorage({
        isLoggedIn: false
      });
    }

    return isLoggedIn;
  } catch (error) {
    Logger.error("Error cek login via cookies:", error);
    return false;
  }
}

// ======================================================================
// ANNOUNCEMENT FUNCTIONS
// ======================================================================

/**
 * Ambil pengumuman dari CIS
 * @returns {Promise<Object>} Hasil pengambilan pengumuman
 */
async function fetchAnnouncements() {
  try {
    Logger.log('Mengambil pengumuman...');

    // Cek login dulu
    const isLoggedIn = await checkLoginWithCookies();
    if (!isLoggedIn) {
      Logger.log('Belum login, tidak bisa ambil pengumuman');
      return { success: false, error: 'Belum login', announcements: [] };
    }

    // Langsung gunakan metode tab untuk mengambil pengumuman
    return await fetchAnnouncementsWithTab();
  } catch (error) {
    Logger.error('Error ambil pengumuman:', error);
    return { success: false, error: String(error), announcements: [] };
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
      url: CONFIG.urls.announcements, 
      active: false 
    }, async (tab) => {
      try {
        Logger.log("Tab pengumuman dibuat, menunggu halaman dimuat...");

        // Tunggu halaman dimuat
        await delay(5000);

        // Inject script untuk mengambil pengumuman
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          function: extractAnnouncementsFromPage
        }, (results) => {
          try {
            chrome.tabs.remove(tab.id);

            if (!results || !results[0]?.result) {
              Logger.error("Gagal mengambil pengumuman dari tab");
              resolve({ 
                success: false, 
                error: "Script extraction failed",
                announcements: [], 
                directUrl: CONFIG.urls.announcements
              });
              return;
            }

            const { announcements, pageTitle } = results[0].result;
            Logger.log(`Berhasil mengambil ${announcements.length} pengumuman dari tab`);
            Logger.log('Judul halaman:', pageTitle);

            // Simpan pengumuman ke storage
            saveToStorage({ 
              announcements: announcements,
              lastAnnouncementFetch: Date.now(),
              directUrl: CONFIG.urls.announcements
            });

            resolve({ 
              success: true, 
              announcements: announcements,
              directUrl: CONFIG.urls.announcements
            });
          } catch (error) {
            Logger.error('Error dalam callback tab:', error);
            resolve({ 
              success: false, 
              error: String(error),
              announcements: [], 
              directUrl: CONFIG.urls.announcements
            });
          }
        });
      } catch (error) {
        Logger.error("Error mengambil pengumuman dengan tab:", error);
        chrome.tabs.remove(tab.id);
        resolve({ 
          success: false, 
          error: String(error),
          announcements: [], 
          directUrl: CONFIG.urls.announcements
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
  console.log("Extracting announcements from page:", document.title);
  
  // Use your simple function that works in console
  function extractAnnouncements() {
    const container = document.querySelector('.pengumuman-browse');
    if (!container) {
      console.error("Announcement container not found");
      return [];
    }
    
    const announcements = [];
    
    // Try table rows first
    const tableRows = container.querySelectorAll('table tbody tr');
    if (tableRows.length > 0) {
      console.log("Found announcement table rows");
      tableRows.forEach((row, index) => {
        const linkElement = row.querySelector('a');
        if (linkElement) {
          announcements.push({
            id: index.toString(),
            title: linkElement.textContent.trim(),
            link: linkElement.href,
            date: '',
            sender: '',
            read: false
          });
        }
      });
      
      if (announcements.length > 0) return announcements;
    }
    
    // Try all links in the container
    console.log("Trying all links in announcement container");
    const links = container.querySelectorAll('a');
    links.forEach((link, index) => {
      if (link.textContent.trim().length > 5 && 
          !link.classList.contains('btn') && 
          !link.classList.contains('nav-link')) {
        
        announcements.push({
          id: index.toString(),
          title: link.textContent.trim(),
          link: link.href,
          date: '',
          sender: '',
          read: false
        });
      }
    });
    
    return announcements;
  }
  
  // Run your simpler extraction function
  const announcements = extractAnnouncements();
  console.log(`Found ${announcements.length} announcements`);
  
  // Return the results to the background script
  return { announcements, pageTitle: document.title };
}


// ======================================================================
// BACKGROUND TASKS & SCHEDULING
// ======================================================================

/**
 * Cek pengumuman secara berkala
 * @returns {Promise<boolean>} Status keberhasilan cek
 */
async function checkAnnouncements() {
  try {
    // Cek login dulu
    const isLoggedIn = await checkLoginWithCookies();

    if (!isLoggedIn) {
      // Coba untuk login otomatis jika ada kredensial
      const loginData = await getFromStorage(['username', 'password']);
      if (!loginData.username || !loginData.password) {
        Logger.log('Tidak dapat cek pengumuman: kredensial tidak ada');
        return false;
      }

      Logger.log('Mencoba login otomatis dengan kredensial tersimpan');
      const loginSuccess = await loginWithTabMethod(loginData.username, loginData.password);
      if (!loginSuccess) {
        Logger.log('Gagal login otomatis, tidak dapat cek pengumuman');
        return false;
      }
    }

    // Ambil pengumuman yang tersimpan untuk perbandingan
    const storedData = await getFromStorage(['announcements', 'lastAnnouncementFetch']);
    
    // Jika cache masih valid, gunakan itu
    const cacheExpiry = CONFIG.cache.announcementExpiryMs;
    const now = Date.now();
    
    if (storedData.announcements && 
        storedData.lastAnnouncementFetch && 
        (now - storedData.lastAnnouncementFetch < cacheExpiry)) {
      
      Logger.log('Menggunakan cache pengumuman (masih valid)');
      await showNewAnnouncementsNotification(storedData.announcements);
      return true;
    }
    
    // Cache sudah tidak valid, ambil pengumuman baru
    Logger.log('Cache tidak valid atau tidak ada, mengambil pengumuman baru');
    const result = await fetchAnnouncements();
    
    if (result.success && result.announcements.length > 0) {
      // Tampilkan notifikasi jika ada pengumuman baru
      await showNewAnnouncementsNotification(result.announcements);
      Logger.log('Berhasil cek dan update pengumuman');
      return true;
    } else {
      Logger.warn('Gagal mengambil pengumuman baru:', result.error || 'Unknown error');
      return false;
    }
  } catch (error) {
    Logger.error('Error cek pengumuman:', error);
    return false;
  }
}

/**
 * Tampilkan notifikasi untuk pengumuman baru
 * @param {Array} announcements - Daftar pengumuman
 * @returns {Promise<boolean>} Status keberhasilan tampilkan notifikasi
 */
async function showNewAnnouncementsNotification(announcements) {
  try {
    // Dapatkan pengumuman tersimpan untuk dibandingkan
    const data = await getFromStorage(['lastNotifiedAnnouncements']);
    const lastAnnouncements = data.lastNotifiedAnnouncements || [];

    // Cari pengumuman baru (yang belum ada di daftar sebelumnya)
    const lastIds = new Set(lastAnnouncements.map(a => a.id));
    const newAnnouncements = announcements.filter(a => !lastIds.has(a.id));

    if (newAnnouncements.length > 0) {
      Logger.log(`Ditemukan ${newAnnouncements.length} pengumuman baru`);
      
      // Tampilkan notifikasi
      chrome.notifications.create({
        type: 'basic',
        iconUrl: '/icon128.png',
        title: 'Pengumuman CIS Baru',
        message: `Ada ${newAnnouncements.length} pengumuman baru dari CIS. Klik untuk melihat.`,
        priority: 2
      });

      // Simpan daftar terbaru untuk perbandingan selanjutnya
      await saveToStorage({ lastNotifiedAnnouncements: announcements });
      return true;
    } else {
      Logger.log('Tidak ada pengumuman baru');
      return false;
    }
  } catch (error) {
    Logger.error('Error tampilkan notifikasi:', error);
    return false;
  }
}

// ======================================================================
// EVENT LISTENERS
// ======================================================================

// Set up alarm untuk cek berkala
chrome.alarms.create('checkCIS', { 
  periodInMinutes: CONFIG.cache.checkIntervalMinutes 
});

// Listener untuk alarm
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'checkCIS') {
    Logger.log('Menjalankan cek berkala pengumuman CIS');
    checkAnnouncements();
  }
});

// Listener untuk klik notifikasi
chrome.notifications.onClicked.addListener(() => {
  chrome.tabs.create({ url: CONFIG.urls.announcements });
});

// Listener untuk instalasi/update ekstension
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    Logger.log('Ekstensi baru diinstal');
    // Bisa lakukan inisialisasi di sini
    await saveToStorage({
      isLoggedIn: false,
      lastAnnouncementFetch: 0,
      announcements: []
    });
  } else if (details.reason === 'update') {
    Logger.log('Ekstensi diperbarui ke versi baru');
    // Bisa lakukan migrasi data di sini jika diperlukan
  }
});

// Listener untuk pesan dari popup atau content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Handler login
  if (message.action === 'login') {
    const { username, password } = message;

    // Store only username, not password for better security
    // Password will be used only for the login attempt
    saveToStorage({ username }).then(async () => {
      const success = await loginWithTabMethod(username, password);

      if (!success) {
        Logger.log('Login gagal dengan tab method, mencoba dengan fetch...');
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
    chrome.tabs.create({ url: CONFIG.urls.login, active: true });
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
    chrome.tabs.create({ url: CONFIG.urls.announcements });
    sendResponse({ success: true });
  }
});
