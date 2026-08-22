
CREATE OR REPLACE FUNCTION public.get_daily_performances(p_agent_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(day_name text, day_index integer, value bigint)
LANGUAGE sql
STABLE SECURITY DEFINER
AS $function$
  SELECT
    to_char(gs.d, 'Dy') AS day_name,
    extract(dow FROM gs.d)::int AS day_index,
    coalesce(count(vr.id), 0) AS value
  FROM generate_series(current_date - interval '6 days', current_date, interval '1 day') gs(d)
  LEFT JOIN verification_requests vr
    ON date_trunc('day', vr.processed_at AT TIME ZONE 'Africa/Brazzaville') = gs.d
    AND vr.status IN ('accepted', 'rejected')
    AND (p_agent_id IS NULL OR vr.agent_id = p_agent_id)
  GROUP BY gs.d
  ORDER BY gs.d;
$function$;
