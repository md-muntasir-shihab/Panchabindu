BEGIN;
DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES ('product-staging', 'product-staging', FALSE, 5242880, ARRAY['image/webp'])
    ON CONFLICT (id) DO NOTHING;
  END IF;
  IF to_regclass('storage.objects') IS NOT NULL THEN
    EXECUTE 'CREATE POLICY erp_private_media_read_guard ON storage.objects AS RESTRICTIVE FOR SELECT TO anon, authenticated USING (bucket_id NOT IN (''product-staging'', ''private-ops-evidence'', ''vendor-private-documents''))';
    EXECUTE 'CREATE POLICY erp_managed_media_insert_guard ON storage.objects AS RESTRICTIVE FOR INSERT TO anon, authenticated WITH CHECK (bucket_id NOT IN (''product-staging'', ''public-catalog-media'', ''private-ops-evidence'', ''vendor-private-documents''))';
    EXECUTE 'CREATE POLICY erp_managed_media_update_guard ON storage.objects AS RESTRICTIVE FOR UPDATE TO anon, authenticated USING (bucket_id NOT IN (''product-staging'', ''public-catalog-media'', ''private-ops-evidence'', ''vendor-private-documents'')) WITH CHECK (bucket_id NOT IN (''product-staging'', ''public-catalog-media'', ''private-ops-evidence'', ''vendor-private-documents''))';
    EXECUTE 'CREATE POLICY erp_managed_media_delete_guard ON storage.objects AS RESTRICTIVE FOR DELETE TO anon, authenticated USING (bucket_id NOT IN (''product-staging'', ''public-catalog-media'', ''private-ops-evidence'', ''vendor-private-documents''))';
  END IF;
END;
$$;
COMMIT;
