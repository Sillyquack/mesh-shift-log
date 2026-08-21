grant execute on function
  public.inventory_reference_image_path_valid(uuid, uuid, text)
to authenticated;

drop policy if exists inventory_reference_images_insert on storage.objects;
create policy inventory_reference_images_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'inventory-location-reference-images'
  and public.current_user_can_manage_inventory_config()
  and public.inventory_reference_image_path_valid(
    public.current_user_organization_id(),
    split_part(storage.objects.name, '/', 2)::uuid,
    storage.objects.name
  )
  and exists (
    select 1
    from public.inventory_locations location
    where location.id = split_part(storage.objects.name, '/', 2)::uuid
      and location.organization_id = public.current_user_organization_id()
      and location.countable
  )
);

drop policy if exists inventory_reference_images_delete on storage.objects;
create policy inventory_reference_images_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'inventory-location-reference-images'
  and public.current_user_can_manage_inventory_config()
  and split_part(storage.objects.name, '/', 1) = public.current_user_organization_id()::text
  and (
    exists (
      select 1
      from public.inventory_locations location
      where location.id = split_part(storage.objects.name, '/', 2)::uuid
        and location.organization_id = public.current_user_organization_id()
        and public.inventory_reference_image_path_valid(
          location.organization_id,
          location.id,
          storage.objects.name
        )
    )
    or exists (
      select 1
      from public.inventory_reference_image_cleanup_queue queue
      where queue.organization_id = public.current_user_organization_id()
        and queue.object_path = storage.objects.name
        and queue.completed_at is null
    )
  )
);
