ALTER TABLE comments ADD COLUMN parent_comment_id TEXT,
    ADD COLUMN mention_ids JSONB NOT NULL DEFAULT '[]';
ALTER TABLE comments ADD CONSTRAINT comments_parent_comment_id_fkey FOREIGN KEY(parent_comment_id) REFERENCES comments(id) ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX comments_parent_comment_id_idx ON comments(parent_comment_id);
CREATE TABLE comment_revisions (
    id TEXT PRIMARY KEY, comment_id TEXT NOT NULL REFERENCES comments(id) ON DELETE CASCADE ON UPDATE CASCADE,
    version INTEGER NOT NULL, content TEXT NOT NULL, body JSONB, mention_ids JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'),
    CONSTRAINT comment_revisions_comment_id_version_key UNIQUE(comment_id,version)
);
INSERT INTO comment_revisions (id,comment_id,version,content,body,mention_ids,created_at)
    SELECT id || '-v' || version, id,version,content,body,mention_ids,updated_at FROM comments;
CREATE FUNCTION flowie_comment_revision() RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO comment_revisions (id,comment_id,version,content,body,mention_ids,created_at)
        VALUES (NEW.id || '-v' || NEW.version, NEW.id,NEW.version,NEW.content,NEW.body,NEW.mention_ids,NEW.updated_at)
        ON CONFLICT(comment_id,version) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER flowie_comment_revision AFTER INSERT OR UPDATE ON comments
    FOR EACH ROW EXECUTE FUNCTION flowie_comment_revision();
