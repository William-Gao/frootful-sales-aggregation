// Welcome page script for Frootful

document.addEventListener('DOMContentLoaded', () => {
  const getStartedBtn = document.getElementById('get-started') as HTMLButtonElement;
  
  if (!getStartedBtn) {
    console.error('Get started button not found');
    return;
  }
  
  // Handle Get Started button click
  getStartedBtn.addEventListener('click', () => {
    // Authenticate the user when they click Get Started
    chrome.runtime.sendMessage({ action: 'authenticate' }, (response: { success: boolean; error?: string }) => {
      if (response.success) {
        // Redirect to Gmail
        window.location.href = 'https://mail.google.com/';
      } else {
        showError('Failed to authenticate. Please try again.');
      }
    });
  });
  
  // Show error message
  function showError(message: string): void {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.style.backgroundColor = '#FEE2E2';
    errorDiv.style.color = '#B91C1C';
    errorDiv.style.padding = '12px';
    errorDiv.style.borderRadius = '6px';
    errorDiv.style.marginBottom = '16px';
    errorDiv.textContent = message;
    
    const actions = document.querySelector('.actions');
    if (actions) {
      actions.before(errorDiv);
    }
    
    // Remove after 5 seconds
    setTimeout(() => {
      errorDiv.remove();
    }, 5000);
  }
  
  // Add animation to steps
  const steps = document.querySelectorAll('.setup li');
  steps.forEach((step, index) => {
    if (step instanceof HTMLElement) {
      step.style.opacity = '0';
      step.style.transform = 'translateY(10px)';
      
      // Stagger animation
      setTimeout(() => {
        step.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
        step.style.opacity = '1';
        step.style.transform = 'translateY(0)';
      }, 100 * (index + 1));
    }
  });
});