page 50100 "Customer Pricing API Setup"
{
    PageType = Card;
    ApplicationArea = All;
    UsageCategory = Administration;
    Caption = 'Frootful Customer Pricing API Setup';
    
    layout
    {
        area(Content)
        {
            group(General)
            {
                Caption = 'General Information';
                
                field(APIInfo; 'This page provides information about the Frootful Customer Pricing API endpoints.')
                {
                    ApplicationArea = All;
                    Editable = false;
                    ShowCaption = false;
                    Style = Strong;
                }
            }
            
            group(Endpoints)
            {
                Caption = 'Available API Endpoints';
                
                field(Endpoint1; 'GET /api/v2.0/companies({companyId})/customerPricingAPI_GetCustomerItemPrice')
                {
                    ApplicationArea = All;
                    Editable = false;
                    ShowCaption = false;
                }
                
                field(Endpoint1Desc; 'Parameters: CustomerNo, ItemNo, Quantity - Returns: Decimal (Unit Price)')
                {
                    ApplicationArea = All;
                    Editable = false;
                    ShowCaption = false;
                    Style = Subordinate;
                }
                
                field(Endpoint2; 'GET /api/v2.0/companies({companyId})/customerPricingAPI_GetCustomerItemPriceWithDetails')
                {
                    ApplicationArea = All;
                    Editable = false;
                    ShowCaption = false;
                }
                
                field(Endpoint2Desc; 'Parameters: CustomerNo, ItemNo, Quantity - Returns: JSON with detailed pricing info')
                {
                    ApplicationArea = All;
                    Editable = false;
                    ShowCaption = false;
                    Style = Subordinate;
                }
                
                field(Endpoint3; 'GET /api/v2.0/companies({companyId})/customerPricingAPI_GetItemsWithCustomerPricing')
                {
                    ApplicationArea = All;
                    Editable = false;
                    ShowCaption = false;
                }
                
                field(Endpoint3Desc; 'Parameters: CustomerNo - Returns: JSON array of all items with customer pricing')
                {
                    ApplicationArea = All;
                    Editable = false;
                    ShowCaption = false;
                    Style = Subordinate;
                }
                
                field(Endpoint4; 'GET /api/v2.0/companies({companyId})/customerPricingAPI_GetCustomersWithPricingGroups')
                {
                    ApplicationArea = All;
                    Editable = false;
                    ShowCaption = false;
                }
                
                field(Endpoint4Desc; 'No parameters - Returns: JSON array of all customers with pricing group info')
                {
                    ApplicationArea = All;
                    Editable = false;
                    ShowCaption = false;
                    Style = Subordinate;
                }
            }
            
            group(Usage)
            {
                Caption = 'Usage Instructions';
                
                field(Usage1; '1. Publish this extension to your Business Central environment')
                {
                    ApplicationArea = All;
                    Editable = false;
                    ShowCaption = false;
                }
                
                field(Usage2; '2. Ensure API services are enabled in Business Central')
                {
                    ApplicationArea = All;
                    Editable = false;
                    ShowCaption = false;
                }
                
                field(Usage3; '3. Configure OAuth authentication for external applications')
                {
                    ApplicationArea = All;
                    Editable = false;
                    ShowCaption = false;
                }
                
                field(Usage4; '4. Use the endpoints in your Frootful extension integration')
                {
                    ApplicationArea = All;
                    Editable = false;
                    ShowCaption = false;
                }
            }
        }
    }
    
    actions
    {
        area(Processing)
        {
            action(TestAPI)
            {
                ApplicationArea = All;
                Caption = 'Test API Connection';
                Image = TestFile;
                
                trigger OnAction()
                var
                    CustomerPricingAPI: Codeunit "Customer Pricing API";
                    TestResult: Decimal;
                begin
                    // Simple test - you can modify this to use actual customer/item data
                    TestResult := CustomerPricingAPI.GetCustomerItemPrice('10000', '1000', 1);
                    Message('API Test Result: Unit Price = %1', TestResult);
                end;
            }
        }
    }
}