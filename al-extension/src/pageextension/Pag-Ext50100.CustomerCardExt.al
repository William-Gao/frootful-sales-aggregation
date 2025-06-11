pageextension 50100 "Customer Card Frootful Ext" extends "Customer Card"
{
    actions
    {
        addlast(processing)
        {
            group(FrootfulActions)
            {
                Caption = 'Frootful Integration';
                
                action(ViewCustomerPricing)
                {
                    ApplicationArea = All;
                    Caption = 'View Customer Pricing';
                    Image = Price;
                    
                    trigger OnAction()
                    var
                        CustomerPricingAPI: Codeunit "Customer Pricing API";
                        PricingJson: Text;
                    begin
                        PricingJson := CustomerPricingAPI.GetItemsWithCustomerPricing(Rec."No.");
                        Message('Customer pricing data generated. Check API endpoint for full details.');
                    end;
                }
            }
        }
    }
}