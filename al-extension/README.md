# Frootful Customer Pricing API Extension

This AL extension provides custom API endpoints for retrieving customer-specific pricing information from Microsoft Business Central, designed to integrate with the Frootful Gmail extension.

## Features

- **Customer-Specific Pricing**: Uses Business Central's built-in pricing engine (V16) for accurate price calculations
- **Multiple API Endpoints**: Various endpoints for different pricing scenarios
- **JSON Responses**: Structured data format for easy integration
- **Pricing Group Support**: Full support for customer pricing groups
- **Real-time Calculations**: Dynamic pricing based on current Business Central setup

## API Endpoints

### 1. GetCustomerItemPrice
- **URL**: `/api/v2.0/companies({companyId})/customerPricingAPI_GetCustomerItemPrice`
- **Method**: GET
- **Parameters**: CustomerNo, ItemNo, Quantity
- **Returns**: Decimal (Unit Price)
- **Description**: Returns the calculated unit price for a specific customer and item

### 2. GetCustomerItemPriceWithDetails
- **URL**: `/api/v2.0/companies({companyId})/customerPricingAPI_GetCustomerItemPriceWithDetails`
- **Method**: GET
- **Parameters**: CustomerNo, ItemNo, Quantity
- **Returns**: JSON object with detailed pricing information
- **Description**: Returns comprehensive pricing details including customer info, pricing group, and price comparison

### 3. GetItemsWithCustomerPricing
- **URL**: `/api/v2.0/companies({companyId})/customerPricingAPI_GetItemsWithCustomerPricing`
- **Method**: GET
- **Parameters**: CustomerNo
- **Returns**: JSON array of items with customer-specific pricing
- **Description**: Returns all items with calculated customer prices

### 4. GetCustomersWithPricingGroups
- **URL**: `/api/v2.0/companies({companyId})/customerPricingAPI_GetCustomersWithPricingGroups`
- **Method**: GET
- **Parameters**: None
- **Returns**: JSON array of customers with pricing group information
- **Description**: Returns all customers with their pricing group details

## Installation Instructions

### Prerequisites
- Business Central Online or On-Premises (Version 19.0 or later)
- AL Development Environment (VS Code with AL extension)
- Business Central development license or sandbox environment

### Steps

1. **Clone or Download** this AL extension project
2. **Open in VS Code** with the AL extension installed
3. **Update app.json** with your specific details:
   - Change the `id` to a unique GUID
   - Update `publisher` to your company name
   - Modify version numbers as needed

4. **Configure Launch Settings**:
   Create `.vscode/launch.json`:
   ```json
   {
       "version": "0.2.0",
       "configurations": [
           {
               "name": "Publish to BC Sandbox",
               "type": "al",
               "request": "launch",
               "environmentType": "Sandbox",
               "environmentName": "YourSandboxName",
               "startupObjectId": 50100,
               "startupObjectType": "Page",
               "breakOnError": true,
               "launchBrowser": true
           }
       ]
   }
   ```

5. **Build and Publish**:
   - Press `Ctrl+Shift+P` and run `AL: Package`
   - Press `F5` to publish to your environment
   - Or use `AL: Publish` command

6. **Verify Installation**:
   - Search for "Customer Pricing API Setup" in Business Central
   - Open the setup page to see available endpoints
   - Test the API using the "Test API Connection" action

### Production Deployment

For production deployment to your live Business Central environment:

1. **Create App Package**: Use `AL: Package` to create a `.app` file
2. **Upload to Business Central**:
   - Go to Extension Management in Business Central
   - Choose "Upload Extension"
   - Select your `.app` file
   - Install the extension

3. **Configure API Access**:
   - Ensure API services are enabled in Business Central
   - Configure OAuth2 authentication for external applications
   - Set up appropriate user permissions for API access

## Usage with Frootful Extension

Once deployed, update your Frootful extension's Business Central integration to use these new API endpoints:

```typescript
// Example: Get customer-specific item price
const priceResponse = await fetch(
  `${bcApiUrl}/companies(${companyId})/customerPricingAPI_GetCustomerItemPriceWithDetails?CustomerNo=${customerNo}&ItemNo=${itemNo}&Quantity=${quantity}`,
  {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  }
);
```

## Troubleshooting

### Common Issues

1. **API Not Found**: Ensure the extension is properly published and installed
2. **Permission Errors**: Verify the user has appropriate API access permissions
3. **Pricing Calculation Errors**: Check that Price Calculation Setup is configured for V16 method

### Support

For issues related to this AL extension, please check:
- Business Central event logs
- AL extension compilation errors
- API endpoint accessibility

## License

This extension is provided as-is for integration with the Frootful Gmail extension. Modify as needed for your specific Business Central environment.