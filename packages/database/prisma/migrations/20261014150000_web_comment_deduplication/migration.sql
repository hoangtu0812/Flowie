ALTER TABLE comments ADD COLUMN client_request_key TEXT;
CREATE UNIQUE INDEX comments_author_id_client_request_key_key ON comments(author_id,client_request_key);
