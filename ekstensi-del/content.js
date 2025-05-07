// This is a minimal content script that might be useful for debugging
// It will log when loaded on CIS pages

console.log('CIS ITDel Helper content script loaded on: ' + window.location.href);

// When on the announcements page, you could extract the HTML structure to help debug
if (window.location.href.includes('/announcement')) {
  console.log('On announcements page, analyzing structure...');

  // Log structure details to help with selector tuning
  window.addEventListener('load', function() {
    // Log table structure if exists
    const tables = document.querySelectorAll('table');
    console.log(`Found ${tables.length} tables on the page`);

    tables.forEach((table, index) => {
      console.log(`Table ${index+1}:`, {
        rows: table.querySelectorAll('tr').length,
        hasHeader: !!table.querySelector('th'),
        classes: table.className
      });
    });

    // Try to identify announcement elements
    const potentialAnnouncementContainers = [
      document.querySelectorAll('.items'),
      document.querySelectorAll('.grid-view'),
      document.querySelectorAll('.announcement-list'),
      document.querySelectorAll('.announcement-item')
    ];

    potentialAnnouncementContainers.forEach((elements, index) => {
      if (elements.length > 0) {
        console.log(`Potential container type ${index+1} found: ${elements.length} elements`);
      }
    });
  });
}
