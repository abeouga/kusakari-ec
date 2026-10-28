-- The application compares roles exactly. The case/width-insensitive column accepted
-- values such as 'seller', which logged in but could not open the seller pages.
ALTER TABLE auth_members DROP CHECK auth_seller_store;
ALTER TABLE auth_members DROP CHECK auth_member_role;
UPDATE auth_members
SET role = CASE WHEN role = 'SELLER' THEN 'SELLER' WHEN role = 'ADMIN' THEN 'ADMIN' ELSE 'USER' END;
ALTER TABLE auth_members
  MODIFY role VARCHAR(10) CHARACTER SET ascii COLLATE ascii_bin NOT NULL DEFAULT 'USER',
  -- Binary comparison also rejects trailing spaces, which ascii_bin pads away.
  ADD CONSTRAINT auth_member_role CHECK (CAST(role AS BINARY) IN ('USER', 'SELLER', 'ADMIN')),
  ADD CONSTRAINT auth_seller_store CHECK (role <> 'SELLER' OR store_id IS NOT NULL);
