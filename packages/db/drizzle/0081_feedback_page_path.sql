-- Add the page_path column to feedbacks so users can attach the page
-- they were viewing when submitting a bug report or idea (resolves
-- feedback 619d3559 — "Option d'ajouter la page en cours dans le report").
ALTER TABLE feedbacks
  ADD COLUMN IF NOT EXISTS page_path varchar(500);
