// Update the import to ERP button click handler
importErpBtn.addEventListener('click', async () => {
  try {
    importErpBtn.disabled = true;
    importErpBtn.textContent = 'Importing...';

    // Get a fresh token
    const token = await authenticateBusinessCentral();
    
    if (!token) {
      throw new Error('Not authenticated with Business Central');
    }

    const response = await fetch('https://api.businesscentral.dynamics.com/v2.0/Production/api/v2.0/companies(45dbc5d1-5408-f011-9af6-6045bde9c6b1)/salesOrders/', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        orderDate: "2015-12-31",
        customerNumber: "C04417",
        currencyCode: "USD"
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to import to ERP: ${response.statusText}`);
    }

    const result = await response.json();
    showSuccess('Successfully imported to ERP');
  } catch (error) {
    console.error('Error importing to ERP:', error);
    showError(error instanceof Error ? error.message : 'Failed to import to ERP');
  } finally {
    importErpBtn.disabled = false;
    importErpBtn.textContent = 'Import to ERP';
  }
});