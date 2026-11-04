-- Useful questions to ask your data (Supabase dashboard, SQL editor).

-- How much data is there?
select count(*) as sessions, (select count(*) from ratings) as ratings from sessions;

-- Like rate by source, and how well the model's score matches reality.
select * from rating_summary;

-- Calibration: when the model said 80%, how often did people actually like it?
select width_bucket(predicted, 0, 1, 10) as bucket,
       count(*) as n, round(avg(label)::numeric, 2) as actual_like_rate, round(avg(predicted)::numeric, 2) as predicted
from ratings where predicted is not null group by 1 order by 1;

-- Do higher ranked picks get liked more? (position 0 is the top of the list)
select position, count(*) as n, round(avg(label)::numeric, 2) as like_rate
from ratings where position is not null group by 1 order by 1 limit 20;

-- Which quiz answers lead to the most thumbs down?
select s.answers->>'budget' as budget, s.answers->>'vibe' as vibe, count(*) as n, round(avg(r.label)::numeric, 2) as like_rate
from ratings r join sessions s on s.id = r.session_id group by 1, 2 having count(*) >= 10 order by like_rate;

-- Delete everything for one session (if someone asks you to).
-- delete from sessions where id = '00000000-0000-0000-0000-000000000000';
