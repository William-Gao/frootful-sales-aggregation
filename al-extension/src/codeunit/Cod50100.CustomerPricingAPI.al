codeunit 50100 "Customer Pricing API"
{
    Caption = 'Customer Pricing API';
    Subtype = Integration;

    [ServiceEnabled]
    procedure GetCustomerItemPrice(
        CustomerNo: Code[20];
        ItemNo: Code[20];
        Quantity: Decimal) : Decimal
    var
        PriceCalcSetup: Record "Price Calculation Setup";
        PriceCalc: Interface "Price Calculation";
        SalesLine: Record "Sales Line" temporary;
        PriceListLineTemp: Record "Price List Line" temporary;
    begin
        // 1) Find the active V16 setup for sales prices
        if not PriceCalcSetup.FindDefault(
             "Price Calculation Method"::"Business Central (Version 16.0)",
             "Price Type"::Sale)
        then
            Error('No V16 price calculation setup found for sales');

        // 2) Seed a temp Sales Line with your inputs
        SalesLine."Sell-to Customer No." := CustomerNo;
        SalesLine.Type := SalesLine.Type::Item;
        SalesLine."No." := ItemNo;
        SalesLine.Quantity := Quantity;
        SalesLine."Document Type" := SalesLine."Document Type"::Order;
        SalesLine."Document No." := 'TEMP001';
        SalesLine."Line No." := 10000;

        // 3) Init and run V16 engine via the standard interface
        PriceCalc.Init(SalesLine, PriceCalcSetup);
        PriceCalc.ApplyPrice(0);
        PriceCalc.GetLine(PriceListLineTemp);  // returns the best match

        // 4) Return the computed unit price
        exit(PriceListLineTemp."Unit Price");
    end;

    [ServiceEnabled]
    procedure GetCustomerItemPriceWithDetails(
        CustomerNo: Code[20];
        ItemNo: Code[20];
        Quantity: Decimal) : Text
    var
        PriceCalcSetup: Record "Price Calculation Setup";
        PriceCalc: Interface "Price Calculation";
        SalesLine: Record "Sales Line" temporary;
        PriceListLineTemp: Record "Price List Line" temporary;
        Customer: Record Customer;
        Item: Record Item;
        JsonObject: JsonObject;
        JsonText: Text;
    begin
        // Get customer and item information
        if not Customer.Get(CustomerNo) then
            Error('Customer %1 not found', CustomerNo);
        
        if not Item.Get(ItemNo) then
            Error('Item %1 not found', ItemNo);

        // Find the active V16 setup for sales prices
        if not PriceCalcSetup.FindDefault(
             "Price Calculation Method"::"Business Central (Version 16.0)",
             "Price Type"::Sale)
        then
            Error('No V16 price calculation setup found for sales');

        // Seed a temp Sales Line with inputs
        SalesLine."Sell-to Customer No." := CustomerNo;
        SalesLine.Type := SalesLine.Type::Item;
        SalesLine."No." := ItemNo;
        SalesLine.Quantity := Quantity;
        SalesLine."Document Type" := SalesLine."Document Type"::Order;
        SalesLine."Document No." := 'TEMP001';
        SalesLine."Line No." := 10000;

        // Run pricing engine
        PriceCalc.Init(SalesLine, PriceCalcSetup);
        PriceCalc.ApplyPrice(0);
        PriceCalc.GetLine(PriceListLineTemp);

        // Build JSON response with detailed information
        JsonObject.Add('customerNo', CustomerNo);
        JsonObject.Add('customerName', Customer.Name);
        JsonObject.Add('customerPricingGroup', Customer."Customer Pricing Group");
        JsonObject.Add('itemNo', ItemNo);
        JsonObject.Add('itemDescription', Item.Description);
        JsonObject.Add('quantity', Quantity);
        JsonObject.Add('unitPrice', PriceListLineTemp."Unit Price");
        JsonObject.Add('standardPrice', Item."Unit Price");
        JsonObject.Add('hasCustomerPrice', PriceListLineTemp."Unit Price" <> Item."Unit Price");
        JsonObject.Add('priceSource', PriceListLineTemp."Source Type");
        
        JsonObject.WriteTo(JsonText);
        exit(JsonText);
    end;

    [ServiceEnabled]
    procedure GetItemsWithCustomerPricing(CustomerNo: Code[20]) : Text
    var
        Item: Record Item;
        Customer: Record Customer;
        PriceCalcSetup: Record "Price Calculation Setup";
        PriceCalc: Interface "Price Calculation";
        SalesLine: Record "Sales Line" temporary;
        PriceListLineTemp: Record "Price List Line" temporary;
        JsonArray: JsonArray;
        JsonObject: JsonObject;
        JsonText: Text;
    begin
        // Validate customer exists
        if not Customer.Get(CustomerNo) then
            Error('Customer %1 not found', CustomerNo);

        // Find the active V16 setup for sales prices
        if not PriceCalcSetup.FindDefault(
             "Price Calculation Method"::"Business Central (Version 16.0)",
             "Price Type"::Sale)
        then
            Error('No V16 price calculation setup found for sales');

        // Loop through all items and get customer-specific pricing
        Item.SetRange(Blocked, false);
        Item.SetRange("Sales Blocked", false);
        if Item.FindSet() then
            repeat
                Clear(JsonObject);
                Clear(SalesLine);
                Clear(PriceListLineTemp);

                // Setup sales line for pricing calculation
                SalesLine."Sell-to Customer No." := CustomerNo;
                SalesLine.Type := SalesLine.Type::Item;
                SalesLine."No." := Item."No.";
                SalesLine.Quantity := 1; // Default quantity for pricing
                SalesLine."Document Type" := SalesLine."Document Type"::Order;
                SalesLine."Document No." := 'TEMP001';
                SalesLine."Line No." := 10000;

                // Calculate customer-specific price
                PriceCalc.Init(SalesLine, PriceCalcSetup);
                PriceCalc.ApplyPrice(0);
                PriceCalc.GetLine(PriceListLineTemp);

                // Build item JSON object
                JsonObject.Add('id', Item.SystemId);
                JsonObject.Add('number', Item."No.");
                JsonObject.Add('displayName', Item.Description);
                JsonObject.Add('unitPrice', Item."Unit Price");
                JsonObject.Add('customerPrice', PriceListLineTemp."Unit Price");
                JsonObject.Add('hasCustomerPrice', PriceListLineTemp."Unit Price" <> Item."Unit Price");
                JsonObject.Add('blocked', Item.Blocked);
                JsonObject.Add('salesBlocked', Item."Sales Blocked");

                JsonArray.Add(JsonObject);
            until Item.Next() = 0;

        JsonArray.WriteTo(JsonText);
        exit(JsonText);
    end;

    [ServiceEnabled]
    procedure GetCustomersWithPricingGroups() : Text
    var
        Customer: Record Customer;
        CustomerPricingGroup: Record "Customer Pricing Group";
        JsonArray: JsonArray;
        JsonObject: JsonObject;
        JsonText: Text;
        PricingGroupName: Text;
    begin
        // Loop through all customers
        Customer.SetRange(Blocked, Customer.Blocked::" ");
        if Customer.FindSet() then
            repeat
                Clear(JsonObject);
                Clear(PricingGroupName);

                // Get pricing group name if exists
                if CustomerPricingGroup.Get(Customer."Customer Pricing Group") then
                    PricingGroupName := CustomerPricingGroup.Description
                else
                    PricingGroupName := Customer."Customer Pricing Group";

                // Build customer JSON object
                JsonObject.Add('id', Customer.SystemId);
                JsonObject.Add('number', Customer."No.");
                JsonObject.Add('displayName', Customer.Name);
                JsonObject.Add('email', Customer."E-Mail");
                JsonObject.Add('customerPricingGroup', Customer."Customer Pricing Group");
                JsonObject.Add('customerPricingGroupName', PricingGroupName);
                JsonObject.Add('blocked', Customer.Blocked);

                JsonArray.Add(JsonObject);
            until Customer.Next() = 0;

        JsonArray.WriteTo(JsonText);
        exit(JsonText);
    end;
}