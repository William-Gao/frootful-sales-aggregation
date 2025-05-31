// Update the initializeData function to show/hide loading states
async function initializeData(token: string): Promise<void> {
  const customerSection = document.getElementById('customer-section');
  const customerContent = customerSection?.querySelector('.customer-content');
  const itemsSection = document.getElementById('items-section');
  const itemsContent = itemsSection?.querySelector('.items-content');
  
  try {
    // Show loading states
    customerSection?.classList.add('loading');
    itemsSection?.classList.add('loading');
    customerContent?.classList.add('hidden');
    itemsContent?.classList.add('hidden');
    
    // Fetch customers and items in parallel
    const [fetchedCustomers, fetchedItems] = await Promise.all([
      fetchCustomers(token),
      fetchItems(token)
    ]);
    
    customers = fetchedCustomers;
    filteredCustomers = [...customers];
    items = fetchedItems;
    
    updateCustomerSelect();
    
    // Hide loading states
    customerSection?.classList.remove('loading');
    itemsSection?.classList.remove('loading');
    customerContent?.classList.remove('hidden');
    itemsContent?.classList.remove('hidden');
  } catch (error) {
    console.error('Error initializing data:', error);
    showError('Failed to load customers and items');
    
    // Hide loading states on error
    customerSection?.classList.remove('loading');
    itemsSection?.classList.remove('loading');
    customerContent?.classList.remove('hidden');
    itemsContent?.classList.remove('hidden');
  }
}