/*
  # Add customer pricing group support

  1. Schema Changes
    - Add `customer_pricing_group` column to user_tokens table for Business Central provider
    - This will store the pricing group ID for the selected customer

  2. Notes
    - Customer pricing groups are fetched from Business Central API
    - Prices are calculated based on customer's pricing group
    - Frontend will display the customer's pricing group information
*/

-- Add customer pricing group column to user_tokens table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'user_tokens' AND column_name = 'customer_pricing_group'
  ) THEN
    ALTER TABLE user_tokens ADD COLUMN customer_pricing_group text;
  END IF;
END $$;

-- Add comment for the new column
COMMENT ON COLUMN user_tokens.customer_pricing_group IS 'Customer pricing group ID for Business Central pricing calculations';