-- New canvases start in the Frost style pack. The client stamps it on every
-- canvas it creates (NEW_CANVAS_ARTIFACT_STYLE_ID); this trigger seeds each new
-- user's first canvas server-side, so it has to say so too — a snapshot with no
-- canvasArtifactStyle loads as vanilla, the legacy fallback.
create or replace function public.handle_new_user_canvas()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.canvases (owner_id, title, state, is_default)
  values (
    new.id,
    'My canvas',
    jsonb_build_object(
      'version', 1,
      'viewport', jsonb_build_object('x', 0, 'y', 0, 'scale', 1),
      'cards', '{}'::jsonb,
      'cardOrder', '[]'::jsonb,
      'connections', '[]'::jsonb,
      'threads', '{}'::jsonb,
      'threadOrder', '[]'::jsonb,
      'groups', '{}'::jsonb,
      'connectorStyle', 'orthogonal',
      'canvasArtifactStyle', 'frost',
      'selectedModel', 'claude-sonnet-4-6',
      'viewMode', 'canvas',
      'sessionArtifacts', '{}'::jsonb,
      'canvasArtifactNodes', '{}'::jsonb,
      'canvasArtifactOrder', '[]'::jsonb,
      'canvasTextLabels', '{}'::jsonb,
      'canvasTextLabelOrder', '[]'::jsonb,
      'uploadedAttachments', '[]'::jsonb
    ),
    true
  );
  return new;
end;
$$;
