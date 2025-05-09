// Sidebar script for Frootful

interface EmailData {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  body: string;
}

document.addEventListener('DOMContentLoaded', () => {
  const closeBtn = document.getElementById('close-btn');
  const emailInfo = document.getElementById('email-info');
  const emailMetadata = document.getElementById('email-metadata');
  const emailBody = document.getElementById('email-body');
  const emailFrom = document.getElementById('email-from');
  const emailSubject = document.getElementById('email-subject');
  const emailDate = document.getElementById('email-date');
  const emailContent = document.getElementById('email-content');
  
  if (!closeBtn || !emailInfo || !emailMetadata || !emailBody || !emailFrom || !emailSubject || !emailDate || !emailContent) {
    console.error('Required elements not found');
    return;
  }
  
  // Handle close button click
  closeBtn.addEventListener('click', () => {
    window.parent.postMessage({ action: 'closeSidebar' }, '*');
  });
  
  // Handle messages from content script
  window.addEventListener('message', async (event: MessageEvent) => {
    if (event.data.action === 'loadEmailData') {
      await displayEmailData(event.data.data);
    }
  });
  
  // Display email data in sidebar
  async function displayEmailData(emailData: EmailData | undefined): Promise<void> {
    if (!emailData) {
      showError('No email data available');
      return;
    }
    
    // Update metadata
    if (emailFrom instanceof HTMLElement) {
      emailFrom.textContent = formatEmailAddress(emailData.from);
    }
    if (emailSubject instanceof HTMLElement) {
      emailSubject.textContent = emailData.subject;
    }
    if (emailDate instanceof HTMLElement) {
      emailDate.textContent = formatDate(emailData.date);
    }
    
    // Update content
    if (emailData.body) {
      // Create a sandbox to safely display HTML content
      const sandbox = document.createElement('div');
      sandbox.innerHTML = emailData.body;
      
      // Clean potentially dangerous elements
      sanitizeHtml(sandbox);
      
      // Update the content
      emailContent.innerHTML = '';
      emailContent.appendChild(sandbox);

      // Add analysis section
      const analysisSection = document.createElement('div');
      analysisSection.className = 'analysis-section';
      analysisSection.innerHTML = '<h2>Purchase Order Analysis</h2><div class="loading">Analyzing email content...</div>';
      emailBody.appendChild(analysisSection);

      try {
        const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-email`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
          },
          body: JSON.stringify({
            emailContent: sandbox.textContent || emailData.snippet
          })
        });

        if (!response.ok) {
          throw new Error('Failed to analyze email');
        }

        const result = await response.json();
        
        if (result.success) {
          analysisSection.innerHTML = `
            <h2>Purchase Order Analysis</h2>
            <div class="analysis-content">${result.analysis.replace(/\n/g, '<br>')}</div>
          `;
        } else {
          throw new Error(result.error || 'Analysis failed');
        }
      } catch (error) {
        analysisSection.innerHTML = `
          <h2>Purchase Order Analysis</h2>
          <div class="error">Failed to analyze email content: ${error instanceof Error ? error.message : 'Unknown error'}</div>
        `;
      }
    } else {
      emailContent.textContent = emailData.snippet || 'No content available';
    }
    
    // Show the sections
    const loadingState = emailInfo.querySelector('.loading-state');
    if (loadingState) {
      loadingState.classList.add('hidden');
    }
    emailMetadata.classList.remove('hidden');
    emailBody.classList.remove('hidden');
  }
  
  // Format email address
  function formatEmailAddress(address: string): string {
    if (!address) return '';
    
    // Try to extract name and email
    const match = address.match(/(.+) <(.+)>/);
    if (match) {
      return match[1]; // Just return the name part
    }
    
    return address;
  }
  
  // Format date
  function formatDate(dateString: string): string {
    if (!dateString) return '';
    
    try {
      const date = new Date(dateString);
      return date.toLocaleString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: 'numeric'
      });
    } catch (e) {
      return dateString;
    }
  }
  
  // Sanitize HTML to prevent XSS
  function sanitizeHtml(element: HTMLElement): void {
    // Remove scripts
    const scripts = element.querySelectorAll('script');
    scripts.forEach(script => script.remove());
    
    // Remove inline event handlers
    const allElements = element.querySelectorAll('*');
    allElements.forEach(el => {
      // Remove all attributes that start with "on"
      for (let i = el.attributes.length - 1; i >= 0; i--) {
        const name = el.attributes[i].name;
        if (name.startsWith('on')) {
          el.removeAttribute(name);
        }
      }
    });
    
    // Sanitize links
    const links = element.querySelectorAll('a');
    links.forEach(link => {
      // Add target="_blank" and rel="noopener noreferrer" to all links
      link.setAttribute('target', '_blank');
      link.setAttribute('rel', 'noopener noreferrer');
      
      // Remove javascript: URLs
      const href = link.getAttribute('href');
      if (href && href.toLowerCase().startsWith('javascript:')) {
        link.removeAttribute('href');
      }
    });
    
    // Remove CSS with position:fixed or position:absolute
    const styles = element.querySelectorAll('style');
    styles.forEach(style => {
      if (style.textContent?.includes('position:') || 
          style.textContent?.includes('position :')) {
        style.remove();
      }
    });
  }
  
  // Show error message
  function showError(message: string): void {
    const loadingState = emailInfo.querySelector('.loading-state');
    if (loadingState) {
      loadingState.classList.add('hidden');
    }
    
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = message;
    
    emailInfo.appendChild(errorDiv);
  }
});