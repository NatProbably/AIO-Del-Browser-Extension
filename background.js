/**
 * CIS DEL Helper Extension - Background Script
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
    announcementExpiryMs: 900 * 1000, // 30 detik (untuk cache)
    checkIntervalSeconds: 900, // Check setiap 30 detik
    backupIntervalMinutes: 1 // Backup alarm setiap 1 menit (minimum Chrome alarm)
  },
  notifications: {
    enabled: true,
    iconUrl: '/icons/icon128.png',
    clickAction: 'openAnnouncements'
  },
  debug: true
};

// ======================================================================
// UTILITIES & HELPERS
// ======================================================================

// ID untuk interval timer
let checkIntervalId = null;

const Logger = {
  log: function(message, ...data) {
    if (CONFIG.debug) {
      console.log(`[CIS Helper] ${message}`, ...data);
      // Simpan log ke storage untuk debugging
      const logMessage = `${new Date().toISOString()} - ${message}`;
      saveLogToStorage(logMessage);
    }
  },
  error: function(message, ...data) {
    if (CONFIG.debug) {
      console.error(`[CIS Helper] ${message}`, ...data);
      // Simpan error log ke storage
      const logMessage = `${new Date().toISOString()} - ERROR: ${message}`;
      saveLogToStorage(logMessage);
    }
  }
};

// Simpan log ke storage dengan jumlah terbatas
async function saveLogToStorage(message) {
  try {
    const data = await getFromStorage(['debugLogs']);
    let logs = data.debugLogs || [];
    logs.push(message);
    
    // Batasi jumlah log (simpan 100 log terakhir)
    if (logs.length > 100) {
      logs = logs.slice(-100);
    }
    
    saveToStorage({ debugLogs: logs });
  } catch (error) {
    console.error('Error saving log:', error);
  }
}

function updateIntervalFromSettings(newInterval) {
  // Hapus alarm lama, buat alarm baru
  chrome.alarms.clear('checkCIS', () => {
    chrome.alarms.create('checkCIS', { periodInMinutes: Math.max(newInterval / 60, 0.5) });
  });
  // Jika pakai setInterval, clearInterval lalu setInterval baru
}

function getStandardHeaders() {
  return {
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/135.0.0.0 Safari/537.36',
    'Accept-Language': 'en-US,en;q=0.9,id;q=0.8',
    'Cache-Control': 'max-age=0',
    'Upgrade-Insecure-Requests': '1'
  };
}

function cleanText(text) {
  if (!text) return '';
  return text.replace(/\s+/g, ' ').trim();
}

function saveToStorage(data) {
  return new Promise((resolve) => {
    chrome.storage.local.set(data, () => {
      if (CONFIG.debug && !data.debugLogs) { // Don't log debugLogs to avoid recursion
        console.log('Data tersimpan:', data);
      }
      resolve(true);
    });
  });
}

chrome.storage.local.get(['interval_check'], function(data) {
  let interval = data.interval_check || 30;
  updateIntervalFromSettings(interval);
});

function getFromStorage(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, (data) => {
      resolve(data);
    });
  });
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ======================================================================
// INTERVAL & ALARM MANAGEMENT
// ======================================================================

/**
 * Setup interval timer untuk pengecekan setiap 30 detik
 */
function setupCheckInterval() {
  // Clear interval yang sudah ada jika ada
  if (checkIntervalId) {
    clearInterval(checkIntervalId);
  }
  
  // Setup interval baru setiap 30 detik
  checkIntervalId = setInterval(() => {
    Logger.log(`Interval timer triggered (every ${CONFIG.cache.checkIntervalSeconds}s)`);
    checkAnnouncements();
  }, CONFIG.cache.checkIntervalSeconds * 1000);
  
  Logger.log(`Interval setup: cek setiap ${CONFIG.cache.checkIntervalSeconds} detik`);
  
  // Simpan status interval ke storage
  saveToStorage({ 
    intervalSetupTime: Date.now(),
    intervalSeconds: CONFIG.cache.checkIntervalSeconds
  });
}

/**
 * Setup alarm sebagai backup (jika service worker di-terminate)
 */
function setupBackupAlarm() {
  // Hapus alarm yang mungkin sudah ada
  chrome.alarms.clear('checkCIS', (wasCleared) => {
    Logger.log(`Alarm lama ${wasCleared ? 'berhasil dihapus' : 'tidak ditemukan'}`);
    
    // Buat alarm baru (minimal 1 menit sesuai batasan Chrome)
    chrome.alarms.create('checkCIS', { 
      periodInMinutes: CONFIG.cache.backupIntervalMinutes
    });
    
    // Verifikasi alarm berhasil dibuat
    chrome.alarms.getAll((alarms) => {
      const cisAlarm = alarms.find(a => a.name === 'checkCIS');
      if (cisAlarm) {
        Logger.log('Alarm backup berhasil dibuat', cisAlarm);
      } else {
        Logger.error('Gagal membuat alarm backup!');
      }
    });
  });
}

// ======================================================================
// LOGIN FUNCTIONS
// ======================================================================

/**
 * Simpan status login
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
 */
async function loginWithTabMethod(username, password) {
  return new Promise((resolve) => {
    chrome.tabs.create({ 
      url: CONFIG.urls.login, 
      active: false 
    }, async (tab) => {
      try {
        Logger.log("Tab dibuat, menunggu halaman dimuat...");
        await delay(3000);

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
              // Inisiasi pengecekan pengumuman setelah login berhasil
              checkAnnouncements();
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
 */
function injectLoginForm(credentials) {
  console.log("Script diinject, mengisi form login...");

  const usernameField = document.querySelector('input[name="LoginForm[username]"]');
  const passwordField = document.querySelector('input[name="LoginForm[password]"]');
  const rememberMeField = document.querySelector('input[name="LoginForm[rememberMe]"]');
  const form = document.querySelector('form');

  if (!usernameField || !passwordField || !form) {
    console.error("Elemen form login tidak ditemukan!");
    return false;
  }

  usernameField.value = credentials.username;
  passwordField.value = credentials.password;
  if (rememberMeField) rememberMeField.checked = true;

  console.log("Mengirim form...");
  form.submit();
  return true;
}

/**
 * Cek status login dengan cookies
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
 */
async function fetchAnnouncements() {
  try {
    Logger.log('Mengambil pengumuman...');

    const isLoggedIn = await checkLoginWithCookies();
    if (!isLoggedIn) {
      Logger.log('Belum login, tidak bisa ambil pengumuman');
      return { success: false, error: 'Belum login', announcements: [] };
    }

    return await fetchAnnouncementsWithTab();
  } catch (error) {
    Logger.error('Error ambil pengumuman:', error);
    return { success: false, error: String(error), announcements: [] };
  }
}

/**
 * Ambil pengumuman langsung dari halaman CIS menggunakan tab
 */
function fetchAnnouncementsWithTab() {
  return new Promise((resolve) => {
    chrome.tabs.create({ 
      url: CONFIG.urls.announcements, 
      active: false 
    }, async (tab) => {
      try {
        Logger.log("Tab pengumuman dibuat, menunggu halaman dimuat...");
        await delay(5000);

        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          function: extractAnnouncementsFromPage
        }, async (results) => {
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

            // Simpan pengumuman ke storage bersama timestamp
            await saveToStorage({ 
              announcements: announcements,
              lastAnnouncementFetch: Date.now(),
              directUrl: CONFIG.urls.announcements
            });

            // Periksa untuk pengumuman baru dan tampilkan notifikasi
            await compareAndNotifyNewAnnouncements(announcements);

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
 */
function extractAnnouncementsFromPage() {
  console.log("Mengekstrak pengumuman dari halaman:", document.title);
  
  function extractAnnouncements() {
    const container = document.querySelector('.pengumuman-browse');
    if (!container) {
      console.error("Announcement container not found");
      return [];
    }
    
    const announcements = [];
    
    // Try to find announcement table rows
    const tableRows = container.querySelectorAll('table tbody tr');
    if (tableRows.length > 0) {
      console.log("Found announcement table rows");
      tableRows.forEach((row, index) => {
        const linkElement = row.querySelector('a');
        if (linkElement) {
          const title = linkElement.textContent.trim();
          const link = linkElement.href;
          
          // Get date if available (usually in the second or third cell)
          const cells = row.querySelectorAll('td');
          let date = '';
          let sender = '';
          
          if (cells.length > 2) {
            date = cells[2].textContent.trim();
          }
          
          if (cells.length > 3) {
            sender = cells[3].textContent.trim();
          }
          
          announcements.push({
            id: `table-${index}`,
            title: title,
            link: link,
            date: date,
            sender: sender,
            read: false,
            addedAt: Date.now()
          });
        }
      });
      
      if (announcements.length > 0) return announcements;
    }
    
    // If no table rows found, try all links in the container
    console.log("Trying all links in announcement container");
    const links = container.querySelectorAll('a');
    links.forEach((link, index) => {
      if (link.textContent.trim().length > 5 && 
          !link.classList.contains('btn') && 
          !link.classList.contains('nav-link')) {
        
        announcements.push({
          id: `link-${index}`,
          title: link.textContent.trim(),
          link: link.href,
          date: '',
          sender: '',
          read: false,
          addedAt: Date.now()
        });
      }
    });
    
    return announcements;
  }
  
  // Run extraction function
  const announcements = extractAnnouncements();
  console.table(announcements);
  
  // Return results
  return { announcements, pageTitle: document.title };
}

/**
 * Bandingkan pengumuman baru dengan yang sudah ada dan notifikasi jika ada yang baru
 */
async function compareAndNotifyNewAnnouncements(newAnnouncements) {
  Logger.log(`Membandingkan ${newAnnouncements.length} pengumuman baru dengan yang tersimpan`);
  
  try {
    const data = await getFromStorage(['lastNotifiedAnnouncements']);
    const lastAnnouncements = data.lastNotifiedAnnouncements || [];
    
    // Debug info
    Logger.log(`Jumlah pengumuman tersimpan sebelumnya: ${lastAnnouncements.length}`);
    
    // Jika belum ada pengumuman yang disimpan sebelumnya
    if (lastAnnouncements.length === 0) {
      Logger.log('Tidak ada pengumuman sebelumnya. Menyimpan semua pengumuman sebagai notified.');
      await saveToStorage({ lastNotifiedAnnouncements: newAnnouncements });
      return;
    }
    
    // Buat set dari ID pengumuman yang sudah ada
    const existingIdentifiers = new Set();
    lastAnnouncements.forEach(announcement => {
      const identifier = announcement.id || 
                        `${announcement.title}|${announcement.link || ''}`;
      existingIdentifiers.add(identifier);
    });
    
    // Filter pengumuman baru
    const brandNewAnnouncements = newAnnouncements.filter(announcement => {
      const identifier = announcement.id || 
                        `${announcement.title}|${announcement.link || ''}`;
      return !existingIdentifiers.has(identifier);
    });
    
    Logger.log(`Ditemukan ${brandNewAnnouncements.length} pengumuman baru`);
    
    if (brandNewAnnouncements.length > 0) {
      // Tampilkan notifikasi
      showNotificationForNewAnnouncements(brandNewAnnouncements);
      
      // Update daftar pengumuman yang sudah dinotifikasi
      await saveToStorage({ 
        lastNotifiedAnnouncements: newAnnouncements,
        hasUnreadAnnouncements: true,
        newAnnouncementsCount: brandNewAnnouncements.length
      });
    } else {
      Logger.log('Tidak ada pengumuman baru');
      await saveToStorage({ lastNotifiedAnnouncements: newAnnouncements });
    }
  } catch (error) {
    Logger.error('Error saat membandingkan pengumuman:', error);
  }
}

/**
 * Tampilkan notifikasi untuk pengumuman baru
 */
function showNotificationForNewAnnouncements(newAnnouncements) {
  if (!CONFIG.notifications.enabled) {
    Logger.log('Notifikasi dinonaktifkan dalam konfigurasi');
    return;
  }
  
  try {
    const count = newAnnouncements.length;
    let message;
    
    if (count === 1) {
      message = `${newAnnouncements[0].title}`;
    } else {
      message = `Ada ${count} pengumuman baru dari CIS. Klik untuk melihat.`;
    }
    
    Logger.log(`Menampilkan notifikasi untuk ${count} pengumuman baru`);
    
    // Buat notifikasi dengan ID tertentu agar bisa diganti jika ada yang baru
    const notificationId = 'cis-new-announcements';
    
    chrome.notifications.create(notificationId, {
      type: 'basic',
      iconUrl: CONFIG.notifications.iconUrl,
      title: 'Pengumuman CIS Baru',
      message: message,
      priority: 2,
      requireInteraction: true
    }, (createdId) => {
      if (chrome.runtime.lastError) {
        Logger.error('Error membuat notifikasi:', chrome.runtime.lastError);
        return;
      }
      
      Logger.log(`Notifikasi berhasil dibuat dengan ID: ${createdId}`);
      
      // Simpan timestamp notifikasi untuk debugging
      saveToStorage({ 
        lastNotificationTime: Date.now(),
        lastNotificationCount: count
      });
    });
  } catch (error) {
    Logger.error('Error menampilkan notifikasi:', error);
  }
}

/**
 * Cek pengumuman secara berkala
 */
async function checkAnnouncements() {
  // Simpan waktu pengecekan untuk debugging
  await saveToStorage({ 
    lastCheckTime: Date.now(),
    checkStatus: 'starting'
  });
  
  Logger.log('Memulai pengecekan pengumuman CIS...');
  
  try {
    // Cek login dulu
    const isLoggedIn = await checkLoginWithCookies();
    
    if (!isLoggedIn) {
      Logger.log('Belum login, tidak dapat cek pengumuman');
      await saveToStorage({ checkStatus: 'failed-not-logged-in' });
      return false;
    }
    
    // Periksa apakah cache masih valid
    const storedData = await getFromStorage(['announcements', 'lastAnnouncementFetch']);
    const cacheExpiry = CONFIG.cache.announcementExpiryMs;
    const now = Date.now();
    
    if (storedData.announcements && 
        storedData.lastAnnouncementFetch && 
        (now - storedData.lastAnnouncementFetch < cacheExpiry)) {
      
      Logger.log('Cache pengumuman masih valid, menggunakan data cache');
      await saveToStorage({ checkStatus: 'using-cache' });
      
      // Gunakan data cache untuk perbandingan
      await compareAndNotifyNewAnnouncements(storedData.announcements);
      return true;
    }
    
    // Cache tidak valid, ambil pengumuman baru
    Logger.log('Mengambil pengumuman baru dari CIS...');
    const result = await fetchAnnouncements();
    
    if (result.success) {
      Logger.log(`Berhasil mengambil ${result.announcements.length} pengumuman`);
      await saveToStorage({ checkStatus: 'success' });
      return true;
    } else {
      Logger.warn('Gagal mengambil pengumuman:', result.error);
      await saveToStorage({ 
        checkStatus: 'failed-fetch-error',
        lastError: result.error
      });
      return false;
    }
  } catch (error) {
    Logger.error('Error pada pengecekan pengumuman:', error);
    await saveToStorage({ 
      checkStatus: 'failed-exception',
      lastError: String(error)
    });
    return false;
  }
}

// ======================================================================
// EVENT LISTENERS & INITIALIZATION
// ======================================================================

// Listener untuk instalasi/update/startup ekstensi
chrome.runtime.onInstalled.addListener((details) => {
  Logger.log(`Ekstensi ${details.reason}: ${details.reason === 'install' ? 'baru diinstal' : 'diperbarui'}`);
  
  // Setup mekanisme pengecekan berkala
  setupCheckInterval();
  setupBackupAlarm();
  
  if (details.reason === 'install') {
    // Inisialisasi storage untuk instalasi baru
    saveToStorage({
      isLoggedIn: false,
      lastAnnouncementFetch: 0,
      announcements: [],
      lastNotifiedAnnouncements: [],
      hasUnreadAnnouncements: false,
      installTime: Date.now()
    });
    
    // Jalankan pengecekan pertama kali setelah instalasi (5 detik)
    setTimeout(() => {
      checkAnnouncements();
    }, 5000);
  }
});

// Ensure timers are setup when browser starts
chrome.runtime.onStartup.addListener(() => {
  Logger.log('Browser dimulai, memastikan timer dan alarm terdaftar');
  setupCheckInterval();
  setupBackupAlarm();
});

// Listener untuk alarm (backup jika service worker direstart)
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'checkCIS') {
    Logger.log('Backup alarm triggered');
    
    // Simpan waktu alarm dipicu
    saveToStorage({ 
      lastAlarmTime: Date.now(),
      alarmName: alarm.name
    });
    
    // Pastikan timer interval masih berjalan
    if (!checkIntervalId) {
      Logger.log('Interval timer tidak berjalan, setup ulang');
      setupCheckInterval();
    }
    
    // Jalankan pengecekan pengumuman
    checkAnnouncements();
  }
});

// Listener untuk klik notifikasi
chrome.notifications.onClicked.addListener((notificationId) => {
  Logger.log(`Notifikasi dengan ID ${notificationId} diklik`);
  
  if (CONFIG.notifications.clickAction === 'openAnnouncements') {
    chrome.tabs.create({ url: CONFIG.urls.announcements });
  } else {
    chrome.action.openPopup();
  }
  
  // Tandai pengumuman sudah dibaca
  saveToStorage({ 
    hasUnreadAnnouncements: false,
    lastNotificationClickTime: Date.now()
  });
});

// Listener untuk pesan dari popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Handler untuk mengupdate interval dari pengaturan
  if (message.action === 'setIntervalCheck') {
    chrome.storage.local.set({ interval_check: message.value });
    if (typeof updateIntervalFromSettings === 'function') {
      updateIntervalFromSettings(message.value);
    }
    sendResponse({ success: true });
  }

  // Handler login
  if (message.action === 'login') {
    const { username, password } = message;
    
    saveToStorage({ username }).then(async () => {
      const success = await loginWithTabMethod(username, password);
      sendResponse({ success });
    });
    
    return true; // Akan merespon secara asynchronous
  }
  
  // Handler cek login
  if (message.action === 'checkLogin') {
    checkLoginWithCookies().then(isLoggedIn => {
      sendResponse({ isLoggedIn });
    });
    return true;
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
    return true;
  }
  
  // Handler untuk perintah checkAnnouncements manual dari popup
  if (message.action === 'checkAnnouncements') {
    Logger.log('Manual check requested from popup');
    checkAnnouncements().then(result => {
      sendResponse({ success: result });
    });
    return true;
  }
  
  // Handler tandai semua pengumuman telah dibaca
  if (message.action === 'markAllAsRead') {
    saveToStorage({ hasUnreadAnnouncements: false }).then(() => {
      sendResponse({ success: true });
    });
    return true;
  }
  
  // Handler untuk debugging
  if (message.action === 'getDebugInfo') {
    getFromStorage([
      'debugLogs', 
      'lastCheckTime', 
      'lastAlarmTime', 
      'intervalSetupTime',
      'checkStatus',
      'lastError'
    ]).then(data => {
      // Tambahkan informasi tentang interval timer
      data.checkIntervalRunning = !!checkIntervalId;
      data.checkIntervalSeconds = CONFIG.cache.checkIntervalSeconds;
      sendResponse(data);
    });
    return true;
  }
  
  // Debugging - buka halaman pengumuman di tab baru
  if (message.action === 'openAnnouncementsPage') {
    chrome.tabs.create({ url: CONFIG.urls.announcements });
    sendResponse({ success: true });
  }
});

// Mulai setup timer interval dan backup alarm saat service worker dimulai
Logger.log('Service worker started. Setting up timers and alarms...');
setupCheckInterval();
setupBackupAlarm();

// Debug: cek dan log semua alarm
chrome.alarms.getAll(alarms => {
  Logger.log('Current alarms:', alarms);
});

// Jalankan pengecekan awal saat service worker dimulai
setTimeout(() => {
  checkAnnouncements();
}, 5000);
