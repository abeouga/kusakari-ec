CREATE TABLE member_pickup_contacts (
 member_id CHAR(36) PRIMARY KEY, recipient_name VARCHAR(100) NOT NULL DEFAULT '', recipient_phone VARCHAR(30) NOT NULL DEFAULT '',
 contact_email VARCHAR(200) NOT NULL DEFAULT '', FOREIGN KEY(member_id) REFERENCES auth_members(id)
);
