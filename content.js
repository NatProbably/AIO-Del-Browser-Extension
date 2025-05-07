// This is a minimal content script that might be useful for debugging

// It will log when loaded on CIS pages
console.log('CIS ITDel Helper content script loaded on: ' + window.location.href);

// When on the announcements page, you could extract the HTML structure to help debug
if (window.location.href.includes('/announcement') || 
    window.location.href.includes('/pengumuman')) {
    
    console.log('On announcements page, analyzing structure...');
    
    // Log structure details to help with selector tuning
    window.addEventListener('load', function() {
        // Extract announcements when page is fully loaded
        const extractedAnnouncements = extractAnnouncements();
        
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

/**
 * Extracts announcements from the CIS Del platform
 * @returns {Array} Array of announcement objects with title and link
 */
function extractAnnouncements() {
  // Try to find the announcement container
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
    tableRows.forEach(row => {
      const linkElement = row.querySelector('a');
      if (linkElement) {
        announcements.push({
          title: linkElement.textContent.trim(),
          link: linkElement.href
        });
      }
    });
    
    if (announcements.length > 0) return announcements;
  }
  
  // Try to find announcement list items
  const listItems = container.querySelectorAll('li, .item, .announcement-item');
  if (listItems.length > 0) {
    console.log("Found announcement list items");
    listItems.forEach(item => {
      const linkElement = item.querySelector('a');
      if (linkElement) {
        announcements.push({
          title: linkElement.textContent.trim(),
          link: linkElement.href
        });
      }
    });
    
    if (announcements.length > 0) return announcements;
  }
  
  // Try all links in the container
  console.log("Trying all links in announcement container");
  const links = container.querySelectorAll('a');
  links.forEach(link => {
    if (link.textContent.trim().length > 5 && 
        !link.classList.contains('btn') && 
        !link.classList.contains('nav-link')) {
      
      announcements.push({
        title: link.textContent.trim(),
        link: link.href
      });
    }
  });
  
  // Execute and display results
  console.table(announcements);

  // Format and display as text
  let output = "Daftar Pengumuman:\n\n";
  announcements.forEach((item, index) => {
    output += `${index + 1}. ${item.title}\n   Link: ${item.link}\n\n`;
  });

  console.log(output);
  
  return announcements;
}
